"""
whatsapp_eb_parser.py
=====================
Parse un message WhatsApp informel et le transforme en EB (Expression des Besoins) structurée.

Usage:
    python whatsapp_eb_parser.py

Le module expose une fonction principale `parse_whatsapp_message(text)` qui retourne
un dictionnaire structuré prêt à être utilisé pour générer un EB.
"""

import re
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json


# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# Mots-clés pour détecter les unités
UNIT_PATTERNS = {
    "sac": ["sac", "sacs", "sachet", "sachets"],
    "botte": ["botte", "bottes", "barre", "barres", "tige", "tiges"],
    "tonne": ["tonne", "tonnes", "t", "ton"],
    "kg": ["kg", "kilos", "kilo", "kilogramme", "kilogrammes"],
    "mètre": ["m", "mètre", "mètres", "metre", "metres", "ml"],
    "litre": ["l", "litre", "litres", "ltr"],
    "pièce": ["pièce", "pièces", "piece", "pieces", "pc", "pcs", "unité", "unités"],
    "rouleau": ["rouleau", "rouleaux"],
    "palette": ["palette", "palettes"],
    "camion": ["camion", "camions", "benne", "bennes"],
}

# Types de matériaux de construction courants
MATERIAL_KEYWORDS = {
    "ciment": {"category": "Matériau de construction", "specs_hint": "Type de ciment (CPJ 42.5, CPJ 32.5, etc.)"},
    "fer": {"category": "Acier / Fer", "specs_hint": "Diamètre (Ø), longueur par barre, type (HA, rond lisse)"},
    "gravier": {"category": "Granulat", "specs_hint": "Granulométrie (5/15, 15/25, etc.)"},
    "sable": {"category": "Granulat", "specs_hint": "Type (sable fin, sable concassé, sable de rivière)"},
    "béton": {"category": "Béton", "specs_hint": "Dosage / résistance (B25, B30, etc.)"},
    "ciment blanc": {"category": "Matériau de construction", "specs_hint": "Type et usage"},
    "tuile": {"category": "Couverture", "specs_hint": "Type (mécanique, plate, etc.), dimension"},
    "tôle": {"category": "Tôle", "specs_hint": "Épaisseur, dimension, type (ondulée, plate)"},
    "brique": {"category": "Brique / Bloc", "specs_hint": "Type (creuse, pleine, hourdis), dimension"},
    "parpaing": {"category": "Brique / Bloc", "specs_hint": "Type (15x20x50, etc.), plein / creux"},
    "bois": {"category": "Bois", "specs_hint": "Essence, section, longueur"},
    "peinture": {"category": "Peinture", "specs_hint": "Type (acrylique, glycéro), couleur, rendement"},
    "câble": {"category": "Électricité", "specs_hint": "Section (mm²), type (U1000R2V, etc.)"},
    "tuyau": {"category": "Plomberie", "specs_hint": "Diamètre, matériau (PVC, PEHD, etc.)"},
}

# Expressions pour détecter la destination / chantier
DESTINATION_PATTERNS = [
    r"pour\s+([A-Za-zÀ-ÿ0-9\s\-]+?)(?:\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)",
    r"à\s+([A-Za-zÀ-ÿ0-9\s\-]+?)(?:\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)",
    r"sur\s+le\s+chantier\s+([A-Za-zÀ-ÿ0-9\s\-]+?)(?:\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)",
    r"chantier\s+([A-Za-zÀ-ÿ0-9\s\-]+?)(?:\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)",
    r"site\s+([A-Za-zÀ-ÿ0-9\s\-]+?)(?:\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)",
]

# Expressions pour détecter le délai
DELAY_PATTERNS = [
    (r"demain\s+matin", 1, "Matinée"),
    (r"demain\s+soir", 1, "Soirée"),
    (r"demain", 1, "Journée"),
    (r"aujourd'hui", 0, "Immédiat"),
    (r"ce\s+soir", 0, "Soirée"),
    (r"ce\s+matin", 0, "Matinée"),
    (r"dans\s+(\d+)\s+jour", None, "Jours"),  # capture le nombre
    (r"dans\s+(\d+)\s+semaine", None, "Semaines"),
    (r"avant\s+la\s+fin\s+de\s+la\s+semaine", 3, "Fin de semaine"),
    (r"urgent", 0, "Immédiat"),
    (r"au\s+plus\s+tôt", 0, "Immédiat"),
    (r"dès\s+que\s+possible", 0, "Immédiat"),
]


# ---------------------------------------------------------------------------
# STRUCTURES DE DONNÉES
# ---------------------------------------------------------------------------

@dataclass
class EBLineItem:
    """Une ligne de besoin dans l'EB."""
    numero: int
    designation: str
    specifications_techniques: str
    quantite: float
    unite: str
    observations: str = ""
    specs_a_preciser: List[str] = field(default_factory=list)


@dataclass
class ExpressionBesoins:
    """EB complète après parsing du message WhatsApp."""
    reference: str
    date_creation: str
    demandeur: str = "À identifier"
    projet_chantier: str = "À préciser"
    date_besoin: str = "À préciser"
    urgence: str = "Normale"
    lignes: List[EBLineItem] = field(default_factory=list)
    actions_dt: List[str] = field(default_factory=list)
    infos_manquantes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


# ---------------------------------------------------------------------------
# FONCTIONS DE PARSING
# ---------------------------------------------------------------------------

def detect_unit(word: str) -> Optional[str]:
    """Détecte l'unité à partir d'un mot."""
    word_lower = word.lower().strip("s,.;:!?")
    for unit, variants in UNIT_PATTERNS.items():
        if word_lower in variants:
            return unit
    return None


def detect_material(text: str) -> Optional[Dict[str, str]]:
    """Détecte le type de matériau dans le texte."""
    text_lower = text.lower()
    for material, info in MATERIAL_KEYWORDS.items():
        if material in text_lower:
            return {"name": material, **info}
    return None


def extract_quantity_and_unit(text: str, start_pos: int) -> tuple:
    """
    Extrait la quantité et l'unité à partir d'une position donnée.
    Cherche un pattern "nombre + unité" autour de la position.
    """
    # Cherche en arrière : "50 sacs de ciment"
    before = text[:start_pos]
    after = text[start_pos:]

    # Pattern: nombre + unité + "de" + mot
    pattern = r"(\d+(?:[.,]\d+)?)\s+(\w+)"

    # Cherche le nombre juste avant le mot
    match = None
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s+(\w+)", text):
        word_end = m.end(2)
        # Vérifie si le mot détecté est une unité
        unit = detect_unit(m.group(2))
        if unit and abs(word_end - start_pos) < 30:
            match = (m.group(1), unit)
            break

    if match:
        qty_str, unit = match
        qty = float(qty_str.replace(",", "."))
        return qty, unit

    return None, None


def parse_products(text: str) -> List[EBLineItem]:
    """
    Parse le texte pour extraire les produits avec quantités et unités.
    """
    lines = []
    line_num = 1

    # Pattern principal : "nombre unité de [désignation]"
    # Ex: "50 sacs de ciment", "4 bottes de fer 8/14", "une tonne de gravier"

    # D'abord, normaliser les nombres écrits en lettres
    text = normalize_numbers(text)

    # Pattern pour capturer : quantité + unité + "de" + désignation
    # On cherche les segments séparés par des virgules ou "et"
    segments = re.split(r",\s*|\s+et\s+|\s*;\s*", text)

    for segment in segments:
        segment = segment.strip()
        if not segment:
            continue

        # Essaie de matcher "nombre unité de désignation"
        match = re.search(r"(\d+(?:[.,]\d+)?)\s+(\w+)\s+(?:de\s+|d\')?(.+)", segment, re.IGNORECASE)

        if match:
            qty_str = match.group(1)
            unit_word = match.group(2).lower()
            designation_raw = match.group(3).strip()

            unit = detect_unit(unit_word)
            if not unit:
                # L'unité n'est pas reconnue, essaie de trouver dans la désignation
                unit = "pièce"  # fallback

            qty = float(qty_str.replace(",", "."))

            # Nettoie la désignation
            designation = clean_designation(designation_raw)

            # Détecte le type de matériau
            material_info = detect_material(designation)

            # Construit les specs techniques
            specs, specs_a_preciser = build_specifications(designation, material_info)

            item = EBLineItem(
                numero=line_num,
                designation=designation,
                specifications_techniques=specs,
                quantite=qty,
                unite=unit,
                observations="Urgent" if "demain" in text.lower() or "aujourd" in text.lower() else "",
                specs_a_preciser=specs_a_preciser
            )
            lines.append(item)
            line_num += 1

    return lines


def normalize_numbers(text: str) -> str:
    """Convertit les nombres écrits en lettres en chiffres."""
    number_map = {
        "une": "1", "un": "1", "deux": "2", "trois": "3", "quatre": "4",
        "cinq": "5", "six": "6", "sept": "7", "huit": "8", "neuf": "9",
        "dix": "10", "vingt": "20", "trente": "30", "quarante": "40",
        "cinquante": "50", "soixante": "60", "cent": "100", "mille": "1000",
        "une tonne": "1 tonne", "un sac": "1 sac", "une botte": "1 botte",
    }
    text_lower = text.lower()
    for word, num in number_map.items():
        # Remplace seulement si c'est un nombre isolé (pas au milieu d'un mot)
        text_lower = re.sub(rf"\b{word}\b", num, text_lower, flags=re.IGNORECASE)
    return text_lower


def clean_designation(text: str) -> str:
    """Nettoie la désignation du produit."""
    # Retire les mots de liaison en fin de phrase
    text = re.sub(r"\s+(?:pour|à|au|sur|demain|matin|soir|aujourd|ce)\s+.+$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+(?:et\s+.+|pour\s+.+)$", "", text, flags=re.IGNORECASE)
    # Capitalise
    text = text.strip(" ,.;")
    return text.capitalize()


def build_specifications(designation: str, material_info: Optional[Dict]) -> tuple:
    """
    Construit les spécifications techniques et liste les champs à préciser.
    Retourne (specs_text, specs_a_preciser_list)
    """
    specs_parts = []
    missing = []

    if material_info:
        specs_parts.append(f"Catégorie: {material_info['category']}")
        missing.append(material_info['specs_hint'])

    # Détecte des patterns techniques dans la désignation
    # Ex: "fer 8/14" → diamètre 8mm et 14mm
    diameter_match = re.search(r"(\d+)[/\-](\d+)", designation)
    if diameter_match:
        specs_parts.append(f"Diamètres détectés: Ø{diameter_match.group(1)}mm et Ø{diameter_match.group(2)}mm")

    # Détecte des dimensions type "15x20x50"
    dim_match = re.search(r"(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+)", designation)
    if dim_match:
        specs_parts.append(f"Dimensions: {dim_match.group(0)}")

    specs_text = " | ".join(specs_parts) if specs_parts else "⚠️ Spécifications à compléter par le DT"

    return specs_text, missing


def detect_destination(text: str) -> str:
    """Détecte la destination / chantier dans le texte."""
    for pattern in DESTINATION_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            dest = match.group(1).strip(" ,.;")
            return dest
    return "À préciser"


def detect_delay(text: str) -> tuple:
    """
    Détecte le délai et le niveau d'urgence.
    Retourne (date_besoin_str, urgence_str)
    """
    text_lower = text.lower()
    today = datetime.now()

    for pattern, days_offset, period in DELAY_PATTERNS:
        match = re.search(pattern, text_lower)
        if match:
            if days_offset is not None:
                target_date = today + timedelta(days=days_offset)
                date_str = target_date.strftime("%d/%m/%Y")
                if period == "Matinée":
                    date_str += " — Matinée"
                elif period == "Soirée":
                    date_str += " — Soirée"
                elif period == "Journée":
                    date_str += " — Journée"

                urgence = "🔴 Haute (D+1)" if days_offset <= 1 else "🟠 Moyenne"
                if days_offset == 0:
                    urgence = "🔴 Haute (Immédiat)"

                return date_str, urgence
            else:
                # Cas avec nombre capturé
                if match.groups():
                    try:
                        nb = int(match.group(1))
                        target_date = today + timedelta(days=nb)
                        date_str = target_date.strftime("%d/%m/%Y")
                        urgence = "🟠 Moyenne" if nb <= 3 else "🟢 Normale"
                        return date_str, urgence
                    except (IndexError, ValueError):
                        pass

    return "À préciser", "🟢 Normale"


def generate_reference() -> str:
    """Génère une référence EB unique."""
    now = datetime.now()
    return f"EB-{now.year}-{now.strftime('%m%d')}-{now.strftime('%H%M')}"


# ---------------------------------------------------------------------------
# FONCTION PRINCIPALE
# ---------------------------------------------------------------------------

def parse_whatsapp_message(text: str, demandeur: str = "À identifier") -> ExpressionBesoins:
    """
    Parse un message WhatsApp et retourne une EB structurée.

    Args:
        text: Le message WhatsApp brut.
        demandeur: Nom du demandeur (si connu).

    Returns:
        ExpressionBesoins: L'EB structurée.
    """

    # 1. Génère la référence
    ref = generate_reference()

    # 2. Détecte la destination
    destination = detect_destination(text)

    # 3. Détecte le délai
    date_besoin, urgence = detect_delay(text)

    # 4. Parse les produits
    lignes = parse_products(text)

    # 5. Compile les infos manquantes
    infos_manquantes = []
    actions_dt = []

    if destination == "À préciser":
        infos_manquantes.append("Destination / chantier non détectée")

    if date_besoin == "À préciser":
        infos_manquantes.append("Date de besoin non détectée")

    for ligne in lignes:
        for spec in ligne.specs_a_preciser:
            infos_manquantes.append(f"Ligne {ligne.numero} ({ligne.designation}): {spec}")

    # Actions DT recommandées
    actions_dt.append("Vérifier et compléter les spécifications techniques")
    if "demain" in text.lower() or "aujourd" in text.lower():
        actions_dt.append("Vérifier la disponibilité des fonds avec le DAF (urgence D+1)")
    actions_dt.append("Ajouter le contact livraison sur site")
    actions_dt.append("Préciser l'heure de livraison souhaitée")

    eb = ExpressionBesoins(
        reference=ref,
        date_creation=datetime.now().strftime("%d/%m/%Y %H:%M"),
        demandeur=demandeur,
        projet_chantier=destination,
        date_besoin=date_besoin,
        urgence=urgence,
        lignes=lignes,
        actions_dt=actions_dt,
        infos_manquantes=infos_manquantes
    )

    return eb


# ---------------------------------------------------------------------------
# AFFICHAGE FORMATÉ
# ---------------------------------------------------------------------------

def print_eb(eb: ExpressionBesoins):
    """Affiche l'EB de manière lisible dans la console."""
    print("=" * 70)
    print(f"  EXPRESSION DES BESOINS — Réf: {eb.reference}")
    print("=" * 70)
    print(f"  Date création : {eb.date_creation}")
    print(f"  Demandeur     : {eb.demandeur}")
    print(f"  Chantier      : {eb.projet_chantier}")
    print(f"  Date besoin   : {eb.date_besoin}")
    print(f"  Urgence       : {eb.urgence}")
    print("-" * 70)
    print(f"  {'N°':<4} {'Désignation':<20} {'Qté':<8} {'Unité':<10} {'Observations'}")
    print("-" * 70)
    for ligne in eb.lignes:
        obs = ligne.observations if ligne.observations else "—"
        print(f"  {ligne.numero:<4} {ligne.designation:<20} {ligne.quantite:<8.0f} {ligne.unite:<10} {obs}")
        print(f"       └─ Specs: {ligne.specifications_techniques}")
        if ligne.specs_a_preciser:
            for s in ligne.specs_a_preciser:
                print(f"          ⚠️  À préciser: {s}")
    print("-" * 70)
    if eb.infos_manquantes:
        print("  📋 Infos manquantes:")
        for info in eb.infos_manquantes:
            print(f"     • {info}")
    print("-" * 70)
    if eb.actions_dt:
        print("  ✅ Actions DT avant validation:")
        for action in eb.actions_dt:
            print(f"     → {action}")
    print("=" * 70)


# ---------------------------------------------------------------------------
# POINT D'ENTRÉE
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Message de l'utilisateur
    message = (
        "Chef, il nous faut 50 sacs de ciment, 4 bottes de fer 8/14 "
        "et une tonne de gravier pour Cocody demain matin"
    )

    print("\n" + "🟢" * 35)
    print("  MESSAGE WHATSAPP BRUT")
    print("🟢" * 35)
    print(f'  "{message}"')
    print("🟢" * 35 + "\n")

    # Parsing
    eb = parse_whatsapp_message(message)

    # Affichage console
    print_eb(eb)

    # Export JSON
    print("\n" + "📤" * 35)
    print("  SORTIE JSON (pour intégration API / Base de données)")
    print("📤" * 35)
    print(eb.to_json(indent=2))

"""
signature_simple.py
===================
Signature électronique simple pour workflow EB.
Pas de cryptographie lourde — juste une traçabilité claire.

Chaque approbateur clique "J'approuve", saisit son code PIN,
et le système enregistre : qui, quand, depuis quelle IP, sur quel document.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Optional, Dict
import hashlib
import json


# ---------------------------------------------------------------------------
# MODÈLE DE DONNÉES
# ---------------------------------------------------------------------------

@dataclass
class Approbation:
    """Une approbation simple sur un document EB."""
    eb_reference: str
    etape: str              # ex: "validation_dt", "approbation_daf_1", "validation_daf_2", "validation_pdg"
    approbateur: str        # Nom du signataire
    role: str               # "DT" | "DAF" | "PDG" | "SA"
    timestamp: str
    ip_address: str
    code_pin_verifie: bool  # True si le PIN a été vérifié
    commentaire: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass 
class EBDocument:
    """Document EB avec son historique d'approbations."""
    reference: str
    contenu: str            # Résumé ou hash du contenu
    date_creation: str
    approbations: List[Approbation] = field(default_factory=list)
    statut: str = "en_cours"  # en_cours | approuvé | rejeté

    def est_approuve_par(self, etape: str) -> bool:
        return any(a.etape == etape for a in self.approbations)

    def get_approbations_par_role(self, role: str) -> List[Approbation]:
        return [a for a in self.approbations if a.role == role]

    def peut_lancer_achat(self, montant: float) -> tuple[bool, List[str]]:
        """Vérifie si toutes les approbations requises sont présentes."""
        manquantes = []

        if not self.est_approuve_par("validation_dt"):
            manquantes.append("Validation DT")
        if not self.est_approuve_par("approbation_daf_1"):
            manquantes.append("1ère Approbation DAF")
        if not self.est_approuve_par("validation_daf_2"):
            manquantes.append("2ème Validation DAF")
        if montant > 500_000 and not self.est_approuve_par("validation_pdg"):
            manquantes.append("Validation PDG (montant > 500K XOF)")

        return len(manquantes) == 0, manquantes


# ---------------------------------------------------------------------------
# BASE DES UTILISATEURS (en prod: base de données)
# ---------------------------------------------------------------------------

UTILISATEURS = {
    "dt001": {"nom": "Kouassi Jean", "role": "DT", "pin": "1234"},
    "daf001": {"nom": "Koné Aminata", "role": "DAF", "pin": "5678"},
    "pdg001": {"nom": "Bamba Koffi", "role": "PDG", "pin": "9999"},
    "sa001": {"nom": "Yao Marie", "role": "SA", "pin": "0000"},
}


# ---------------------------------------------------------------------------
# MOTEUR DE SIGNATURE SIMPLE
# ---------------------------------------------------------------------------

class SignatureSimple:
    """
    Moteur de signature électronique simplifié.

    Règles:
    - Le signataire saisit son ID + PIN
    - Le système enregistre l'approbation avec horodatage
    - Pas de cryptographie complexe — juste une traçabilité irréfutable
    """

    def __init__(self):
        self.documents: Dict[str, EBDocument] = {}
        self.historique: List[Approbation] = []

    def _verifier_pin(self, user_id: str, pin: str) -> Optional[dict]:
        """Vérifie le PIN de l'utilisateur."""
        user = UTILISATEURS.get(user_id)
        if user and user["pin"] == pin:
            return user
        return None

    def approuver(self, 
                   eb_ref: str, 
                   user_id: str, 
                   pin: str, 
                   etape: str,
                   ip_address: str = "127.0.0.1",
                   commentaire: str = "") -> dict:
        """
        Approuve un document EB.

        Args:
            eb_ref: Référence de l'EB
            user_id: Identifiant du signataire
            pin: Code PIN à 4 chiffres
            etape: L'étape d'approbation
            ip_address: IP du signataire (traçabilité)
            commentaire: Commentaire optionnel

        Returns:
            dict avec statut et message
        """
        # Vérifie l'utilisateur
        user = self._verifier_pin(user_id, pin)
        if not user:
            return {"statut": "erreur", "message": "PIN incorrect ou utilisateur inconnu"}

        # Vérifie que l'étape correspond au rôle
        etapes_par_role = {
            "DT": ["validation_dt"],
            "DAF": ["approbation_daf_1", "validation_daf_2"],
            "PDG": ["validation_pdg"],
            "SA": ["lancement_achat"]
        }

        if etape not in etapes_par_role.get(user["role"], []):
            return {
                "statut": "erreur", 
                "message": f"Étape '{etape}' non autorisée pour le rôle {user['role']}"
            }

        # Crée l'approbation
        approbation = Approbation(
            eb_reference=eb_ref,
            etape=etape,
            approbateur=user["nom"],
            role=user["role"],
            timestamp=datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            ip_address=ip_address,
            code_pin_verifie=True,
            commentaire=commentaire
        )

        # Enregistre
        self.historique.append(approbation)

        if eb_ref not in self.documents:
            self.documents[eb_ref] = EBDocument(
                reference=eb_ref,
                contenu="",
                date_creation=datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            )

        self.documents[eb_ref].approbations.append(approbation)

        return {
            "statut": "succès",
            "message": f"✅ {user['nom']} ({user['role']}) a approuvé l'étape '{etape}'",
            "approbation": approbation.to_dict()
        }

    def verifier_blocage(self, eb_ref: str, montant: float) -> dict:
        """Vérifie si le document peut passer à l'étape suivante."""
        doc = self.documents.get(eb_ref)
        if not doc:
            return {"statut": "erreur", "message": "Document non trouvé"}

        ok, manquantes = doc.peut_lancer_achat(montant)

        return {
            "statut": "succès",
            "peut_lancer": ok,
            "approbations_presentes": [a.etape for a in doc.approbations],
            "approbations_manquantes": manquantes
        }

    def afficher_historique(self, eb_ref: str) -> str:
        """Affiche l'historique des approbations d'un EB."""
        doc = self.documents.get(eb_ref)
        if not doc or not doc.approbations:
            return f"Aucune approbation pour {eb_ref}"

        lignes = [f"📋 Historique des approbations — {eb_ref}", "=" * 55]
        for a in doc.approbations:
            lignes.append(f"  ✓ {a.etape:<25} | {a.approbateur} ({a.role}) | {a.timestamp}")
            if a.commentaire:
                lignes.append(f"    💬 {a.commentaire}")
        lignes.append("=" * 55)
        return "\n".join(lignes)


# ---------------------------------------------------------------------------
# DÉMONSTRATION
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    moteur = SignatureSimple()
    eb_ref = "EB-2026-0814-001"

    print("🔷" * 30)
    print("  DÉMONSTRATION — Signature Simple Workflow EB")
    print("🔷" * 30 + "\n")

    # Étape 3: DT valide
    print("📌 Étape 3 — Validation DT")
    result = moteur.approuver(eb_ref, "dt001", "1234", "validation_dt", "192.168.1.10")
    print(f"   {result['message']}")
    print()

    # Étape 4: DAF 1ère approbation
    print("📌 Étape 4 — 1ère Approbation DAF (principe/budget)")
    result = moteur.approuver(eb_ref, "daf001", "5678", "approbation_daf_1", "192.168.1.20")
    print(f"   {result['message']}")
    print()

    # Étape 5: SA recherche fournisseurs (pas de signature requise, juste action)
    print("📌 Étape 5 — Recherche fournisseurs (SA)")
    print("   Le SA identifie les fournisseurs et les montants...")
    print("   Montant total estimé: 750 000 XOF")
    print()

    # Étape 6: DAF 2ème validation
    print("📌 Étape 6 — 2ème Validation DAF (avec montants)")
    result = moteur.approuver(
        eb_ref, "daf001", "5678", "validation_daf_2", "192.168.1.20",
        commentaire="Montant validé, dans le budget chantier Cocody"
    )
    print(f"   {result['message']}")
    print(f"   💬 Commentaire: {result['approbation']['commentaire']}")
    print()

    # Vérification avant PDG
    print("📌 Vérification blocage (avant PDG)")
    blocage = moteur.verifier_blocage(eb_ref, 750_000)
    print(f"   Peut lancer achat ? {'✅ OUI' if blocage['peut_lancer'] else '❌ NON'}")
    print(f"   Manquant: {blocage['approbations_manquantes']}")
    print()

    # Étape 7: PDG valide (>500K)
    print("📌 Étape 7 — Validation PDG (montant > 500K XOF)")
    result = moteur.approuver(eb_ref, "pdg001", "9999", "validation_pdg", "192.168.1.1")
    print(f"   {result['message']}")
    print()

    # Vérification finale
    print("📌 Vérification finale — Lancement achat")
    blocage = moteur.verifier_blocage(eb_ref, 750_000)
    print(f"   Peut lancer achat ? {'✅ OUI' if blocage['peut_lancer'] else '❌ NON'}")
    if blocage['approbations_manquantes']:
        print(f"   Manquant: {blocage['approbations_manquantes']}")
    else:
        print("   Toutes les signatures sont présentes. Le SA peut générer le bon de commande.")
    print()

    # Historique complet
    print(moteur.afficher_historique(eb_ref))

    # Test: refus avec mauvais PIN
    print("\n🔒 Test sécurité — PIN incorrect")
    result = moteur.approuver(eb_ref, "dt001", "0000", "validation_dt")
    print(f"   {result['message']}")

    # Test: rôle non autorisé
    print("\n🔒 Test sécurité — Rôle non autorisé")
    result = moteur.approuver(eb_ref, "dt001", "1234", "validation_pdg")
    print(f"   {result['message']}")

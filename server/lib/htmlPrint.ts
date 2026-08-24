/** Barre d’impression pour les fiches HTML (EB / BC / BT). */

const PRINT_CHROME = `<div class="print-bar" style="position:sticky;top:0;z-index:2;background:#fff;padding:8px 12px;border-bottom:1px solid #ccc;font-family:Arial,sans-serif">
  <button type="button" onclick="window.print()" style="padding:6px 12px;font-size:13px;cursor:pointer">Imprimer</button>
</div>
<style>@media print { .print-bar { display: none !important; } }</style>`

export function withPrintBar(html: string): string {
  return html.replace(/<body([^>]*)>/i, `<body$1>\n${PRINT_CHROME}`)
}

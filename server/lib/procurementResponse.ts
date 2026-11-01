/** Le HTML des documents est consulté sur les endpoints dédiés, pas transporté dans chaque JSON. */
export function stripStoredDocumentHtml(value: unknown): unknown {
 if(Array.isArray(value))return value.map(stripStoredDocumentHtml)
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){
  return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='pdfHtml').map(([key,item])=>[key,stripStoredDocumentHtml(item)]))
 }
 return value
}

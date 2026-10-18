/** Verified identity correspondence from the current reviewed science registry.
 * No fuzzy topic/name matching: unsupported concepts remain unsupported.
 */
const aliases:Record<string,string>={"sci-g10-cho-007":"sci-g10-col-001"};
export const modelConceptId=(id:string):string=>aliases[id]||id;
export function serviceConceptIds(modelIds:string[]):string[] {
 return [...modelIds,...Object.keys(aliases).filter(id=>modelIds.includes(aliases[id]))];
}

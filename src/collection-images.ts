import collection from '../contracts/open-collection.json';

const images=new Map(collection.contents.filter(c=>c.asset).map(c=>{
  const filename=c.asset!;
  return [c.resourceId,new URL(`./assets/collection/${filename}`,import.meta.url).href];
}));

export function collectionImage(resourceId:string){return images.get(resourceId);}

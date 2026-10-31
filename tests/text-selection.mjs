// Exercise the browser's native Selection/Range across rendered text and marks.
export async function selectText(viewer,startParagraph,start,endParagraph=startParagraph,end=null,reverse=false){
  return viewer.evaluate((root,args)=>{
    const paragraphs=root.querySelectorAll('[data-text-paragraph]');
    function point(index,offset){
      const paragraph=paragraphs[index];
      let remaining=offset??paragraph.textContent.length;
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(remaining<=node.textContent.length)return {node,offset:remaining};
        remaining-=node.textContent.length;
      }
      throw new Error('Text offset out of range');
    }
    const first=point(args.startParagraph,args.start),last=point(args.endParagraph,args.end);
    const selection=window.getSelection();
    selection.removeAllRanges();
    if(args.reverse)selection.setBaseAndExtent(last.node,last.offset,first.node,first.offset);
    else selection.setBaseAndExtent(first.node,first.offset,last.node,last.offset);
    return selection.toString();
  },{startParagraph,start,endParagraph,end,reverse});
}

/* A classic script in the page's head, directly after the three bundled libraries: it publishes the diagram
   library's config and starts the library once the page is parsed — where and when it ran while it was written into the page
   (the page's policy runs no script written into a page). */
// The full mermaid config is published (handbook.js, the floating panel and a pop-out re-initialise from it: initialize() rebuilds the
// whole config). The library runs in its STRICT mode for everyone — the GM's own screen too: an action of a diagram that calls a function
// never runs, and a diagram's link is an address its own cleaner has passed. A diagram's link is still an ordinary web link: only the
// one line docrender.js writes for it reaches the library (click <id> href "<address>"), and a click on it is linkgate.js's to judge.
// A diagram's labels are HTML that mermaid cleans itself (DOMPurify, in every security level): no picture, no inline style, no
// link in a label, so a diagram from a file or another table never makes this machine fetch an address (a picture or a url()).
// A formula in a label ($$…$$) is drawn as a math element, and the library sends it through these same rules: math is let
// through (forbidding it left the label blank), its picture element (mglyph) is not.
// 'secure' keeps a diagram's own %%{init}%% directive from changing that.
window.wpMermaidConfig = { startOnLoad: false, securityLevel: 'strict', flowchart: { curve: 'basis', useMaxWidth: true },
    dompurifyConfig: { FORBID_TAGS: ['style', 'img', 'image', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'svg', 'mglyph', 'form', 'input', 'button'], FORBID_ATTR: ['style', 'src', 'srcset', 'href', 'xlink:href', 'background', 'poster', 'action', 'formaction', 'ping'] },
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'dompurifyConfig'] };
document.addEventListener("DOMContentLoaded", function() {
    if (window.mermaid) {
        mermaid.initialize(window.wpMermaidConfig);
    }
});

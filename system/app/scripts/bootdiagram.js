/* A classic script in the page's head, directly after the three bundled libraries: it publishes the diagram
   library's config and starts the library once the page is parsed — where and when it ran while it was written into the page
   (the page's policy runs no script written into a page). */
// The full mermaid config is published: handbook.js re-initialises with securityLevel 'strict' while a
// joined player has someone else's campaign on screen (initialize() rebuilds the whole config from it).
// A diagram's labels are HTML that mermaid cleans itself (DOMPurify, in every security level): no picture, no inline style, no
// link in a label, so a diagram from a file or another table never makes this machine fetch an address (a picture or a url()).
// 'secure' keeps a diagram's own %%{init}%% directive from changing that.
window.wpMermaidConfig = { startOnLoad: false, securityLevel: 'loose', flowchart: { curve: 'basis', useMaxWidth: true },
    dompurifyConfig: { FORBID_TAGS: ['style', 'img', 'image', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'svg', 'math', 'form', 'input', 'button'], FORBID_ATTR: ['style', 'src', 'srcset', 'href', 'xlink:href', 'background', 'poster', 'action', 'formaction', 'ping'] },
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'dompurifyConfig'] };
document.addEventListener("DOMContentLoaded", function() {
    if (window.mermaid) {
        mermaid.initialize(window.wpMermaidConfig);
    }
});

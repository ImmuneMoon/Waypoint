/* The error banner: an uncaught error or a rejected promise anywhere in the app shows a line across the top (click to dismiss).
   A classic script in the page's head, after the stylesheet and before every other script — where it was written into the page
   until the page's policy stopped running script written into a page — so it is listening before any of the app's code runs. */
function showErrorBanner(text, color, top) {
    var errDiv = document.createElement('div');
    errDiv.style.position = 'absolute';
    errDiv.style.top = top;
    errDiv.style.left = '0';
    errDiv.style.backgroundColor = color;
    errDiv.style.color = 'white';
    errDiv.style.zIndex = '999999';
    errDiv.style.padding = '12px 20px';
    errDiv.style.cursor = 'pointer';
    errDiv.style.fontSize = '13px';
    errDiv.textContent = text + '  (click to dismiss)';
    errDiv.addEventListener('click', function() { errDiv.remove(); });
    setTimeout(function() { errDiv.remove(); }, 12000);
    document.body.appendChild(errDiv);
}
window.addEventListener('error', function(e) {
    showErrorBanner("ERROR: " + e.message + " in " + e.filename + ":" + e.lineno, '#c0392b', '0');
});
window.addEventListener('unhandledrejection', function(e) {
    showErrorBanner("PROMISE REJECTION: " + (e.reason && e.reason.message ? e.reason.message : e.reason), '#d68910', '50px');
});

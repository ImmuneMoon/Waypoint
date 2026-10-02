/* The light theme, set before the stylesheet is read so the page never shows the dark one first. A classic script in the page's
   head, loaded before style.css (it was written into the page there until the page's policy stopped running script written
   into a page): the parser waits for it exactly as it ran the inline one, so its order and timing are unchanged. */
try { if (localStorage.getItem('wp_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}

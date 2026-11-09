/* The light theme, set before the stylesheet is read so the page never shows the dark one first. A classic script in the page's
   head, loaded before style.css (it was written into the page there until the page's policy stopped running script written
   into a page): the parser waits for it exactly as it ran the inline one, so its order and timing are unchanged. */
try { if (localStorage.getItem('wp_theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}
/* A page a website serves (any name but this computer's own, as webmode.js WEB_LOCAL lists them) keeps the app out of sight from its first paint until
   webmode.js has judged the site's answer and put away what the plan does not show, at most its 4 s wait: a player never sees the GM's screens,
   even for a moment (the website session, from the owner's recording of 2026-11-09). The join page stands outside .app and shows at once. */
try { var wpHost = location.hostname; if (wpHost !== 'localhost' && wpHost !== '127.0.0.1' && wpHost !== '[::1]') document.documentElement.classList.add('web-wait'); } catch (e) {}

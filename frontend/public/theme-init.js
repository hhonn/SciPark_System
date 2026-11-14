// Applies the saved theme before first paint so a dark-mode user never gets a
// white flash. Kept as a separate file rather than an inline <script> because
// the server's Content-Security-Policy is `script-src 'self'`. An inline
// script would be blocked, and loosening the CSP to 'unsafe-inline' for this
// one line would weaken every page.
(function () {
  try {
    var saved = localStorage.getItem('scipark-theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    // private mode / blocked storage: fall back to the system preference
  }
})();

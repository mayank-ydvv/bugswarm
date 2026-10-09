// BUG (semgrep XSS): query param written to innerHTML.
const name = new URLSearchParams(location.search).get('name') ?? 'friend';
document.getElementById('greeting').innerHTML = `Hello, ${name}!`;

// BUG (playwright console error): reads a property of null on every load.
console.error('Failed to load recommendations');
document.querySelector('#recommendations').textContent = 'none';

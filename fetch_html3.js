async function fetchHtml() {
  const res = await fetch('https://frexosm.ru/basin/');
  const html = await res.text();
  console.log(html.substring(4000, 6000));
}
fetchHtml();

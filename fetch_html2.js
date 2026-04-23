async function fetchHtml() {
  const res = await fetch('https://frexosm.ru/basin/');
  const html = await res.text();
  console.log(html.substring(2000, 4000));
  
}
fetchHtml();

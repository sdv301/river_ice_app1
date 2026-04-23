async function fetchStyle() {
  const res = await fetch('https://frexosm.ru/mb-styles/river_basin.style');
  const style = await res.json();
  console.log(JSON.stringify(style.sources, null, 2));
}
fetchStyle();

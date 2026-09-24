async function fetchPage(url : string): Promise<string> { 
   const response = await fetch(url);
   const html = await response.text();
   return html;
}

fetchPage("https://books.toscrape.com/catalogue/page-1.html") .then(html => {
    console.log(html.length);
    console.log(html.slice ( 0, 300));
});
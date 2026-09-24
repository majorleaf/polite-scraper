async function fetchPage(url : string): Promise<string> { 
   const response = await fetch(url , {
    headers: {
        "User-Agent": "FlyRankInternshipA9/1.0 (+https://github.com/majorleaf/polite-scraper)", 
    },
   });

   if (response.status !== 200 ) {
    throw new Error(`Fetch failed: ${response.status}  for ${url}`)
   }
   const html = await response.text();
   return html;
}

fetchPage("https://books.toscrape.com/catalogue/page-1.html") .then(html => {
    console.log(html.length);
    console.log(html.slice ( 0, 300));
});
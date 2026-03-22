// map.js - D3 World Map Background
document.addEventListener("DOMContentLoaded", () => {
  const mapContainer = document.getElementById('map-container');
  const width = mapContainer.clientWidth || 800;
  const height = mapContainer.clientHeight || 800;

  const svg = d3.select("#map-container")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);

  // Base projection centered in the layout
  const projection = d3.geoMercator()
    .scale(width / 5.5)
    .translate([width / 2, height / 1.7]);

  const path = d3.geoPath().projection(projection);

  // Load external geojson
  d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson").then(function(data){
    svg.append("g")
      .selectAll("path")
      .data(data.features)
      .join("path")
        .attr("d", path)
        .attr("fill", "#d9d2c6") // Subtle beige blending with WA background
        .attr("stroke", "#ffffff")
        .attr("stroke-width", "0.6")
        .style("opacity", 0.6)
        .attr("class", d => `Country`);
        
    // Save map data to window for efficient highlight queries
    window.mapPaths = svg.selectAll("path");
  });

  window.MapModule = {
    highlightCountry: function(countryName, color, duration = 3000) {
      if (!window.mapPaths) return;
      
      let nameMap = { "USA": "USA", "UK": "England", "Russia": "Russia" };
      let searchName = nameMap[countryName] || countryName;
      
      const el = window.mapPaths.filter(function(d) {
          return d.properties.name.includes(searchName) || searchName.includes(d.properties.name);
      });
      
      if (!el.empty()) {
         el.transition().duration(200)
           .attr("fill", color)
           .transition().duration(duration)
           .attr("fill", "#d9d2c6");
      }
    },
    
    votePulse: function(countryName, isFavour) {
      if (!window.mapPaths) return;
      let searchName = countryName === "USA" ? "USA" : countryName === "UK" ? "England" : countryName;
      const color = isFavour ? "#25D366" : "#dc3545"; // WA Green or Red
      
      const el = window.mapPaths.filter(function(d) {
          return d.properties.name.includes(searchName) || searchName.includes(d.properties.name);
      });
      
      if (!el.empty()) {
         el.transition().duration(300)
           .attr("fill", color)
           .transition().duration(4000)
           .attr("fill", "#d9d2c6");
      }
    }
  };
});

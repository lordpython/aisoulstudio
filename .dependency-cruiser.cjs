/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: "^packages",
    exclude: "(^|/)dist/|(^|/)build/",
  },
};

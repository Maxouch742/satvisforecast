//const { defineConfig } = require('@vue/cli-service')
/*module.exports = defineConfig({
  transpileDependencies: true,
  publicPath: process.env.NODE_ENV === "production" ? "/SatVisForecast/" : "/",
})
*/
const publicPath = process.env.NODE_ENV === 'production' ? '/SatVisForecast/' : '/'
module.exports = {
 publicPath: publicPath,
}
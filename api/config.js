// Vercel serverless function — serves MAPBOX_TOKEN as a JS variable
// Token is read from the MAPBOX_TOKEN environment variable set in Vercel dashboard

module.exports = function (req, res) {
    var token = process.env.MAPBOX_TOKEN || '';
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send('var MAPBOX_TOKEN = ' + JSON.stringify(token) + ';');
};

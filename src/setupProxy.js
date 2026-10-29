// Dev server của CRA tự nạp file này: cho phép /api/proxy, /api/search chạy khi `npm start`.
const proxy = require('../api/proxy');
const search = require('../api/search');

module.exports = function setupProxy(app) {
  app.all('/api/proxy', (req, res) => proxy(req, res));
  app.get('/api/search', (req, res) => search(req, res));
};

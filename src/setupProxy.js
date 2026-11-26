// Dev server của CRA tự nạp file này: cho phép /api/proxy chạy khi `npm start`.
const proxy = require('../api/proxy');

module.exports = function setupProxy(app) {
  app.all('/api/proxy', (req, res) => proxy(req, res));
};

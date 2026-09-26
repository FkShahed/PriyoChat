module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      function () {
        return {
          visitor: {
            MetaProperty(path) {
              if (path.node.meta && path.node.meta.name === 'import' && path.node.property && path.node.property.name === 'meta') {
                path.replaceWithSourceString('{ env: {} }');
              }
            },
          },
        };
      },
    ],
  };
};
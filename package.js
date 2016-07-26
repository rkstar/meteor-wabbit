Package.describe({
  name: 'rkstar:wabbit',
  version: '2.0.1',
  // Brief, one-line summary of the package.
  summary: 'Simplify working with RabbitMQ - built on top of Rabbot',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/rkstar/meteor-wabbit',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
})

Package.onUse(function(api) {
  api.versionsFrom('1.3.5.1')
  api.use('ecmascript', 'server')
  api.use('modules')
  api.mainModule('wabbit.js', 'server')
})

Npm.depends({
  rabbot: "1.0.3",
  lodash: "4.14.0"
})
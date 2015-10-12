Package.describe({
  name: 'rkstar:wabbit',
  version: '1.0.5',
  // Brief, one-line summary of the package.
  summary: 'Simplify working with RabbitMQ - built on top of Wascally',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/rkstar/meteor-wabbit',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
})

Package.onUse(function(api) {
  api.versionsFrom('1.2.0.2')

  Npm.depends({'wascally': '0.2.7'})

  api.use('ecmascript', 'server')
  api.use('promise', 'server')
  api.use('underscore', 'server')
  api.use('reactive-var', 'server')


  api.addFiles('wascally.js', 'server')
  api.addFiles('wabbit.js', 'server')

  api.export('Wascally')
  api.export('Wabbit')
})

import { DefaultFeature, DockerComposeFeature, FeatureAsyncInit } from '../../feature'
import { RegistryClient } from '../../../docker/registry'
import { ConfigBuilder } from '@gfi-centre-ouest/docker-compose-builder'
import { AnswersFeature, AnswersFeatures, FeatureContext } from '../../../index'
import { PortsManager } from '../../../managers'
import { DockerDevboxExt } from '../../../docker'
import { BulkOptions } from '../../../templating'
import * as glob from 'glob'
import { rsort } from '../../../semver-utils'
import { ChoiceOptions, ListChoiceOptions } from 'inquirer'
import { cleanupAnswers } from '../../../answers'
import { Answers, Question, Questions } from 'yeoman-generator'

export abstract class Php extends DefaultFeature implements DockerComposeFeature<Php>, FeatureAsyncInit {
  instanceName: string = 'web'
  directory: string | string[] = __dirname
  duplicateAllowed: boolean = true

  asyncQuestions: Question<Answers>[] = []

  abstract phpMode: string

  async initAsync () {
    const registry = new RegistryClient()
    const allTags = await registry.tagsList('php')

    let tags = allTags
      .filter(tag => new RegExp(`-${this.phpMode}$`).test(tag))
      .filter(tag => /^\d+\.\d+-/.test(tag))
      .filter(tag => !/-rc.*/.test(tag))
      .map(tag => tag.substring(0, tag.length - `-${this.phpMode}`.length))
      .reverse()

    tags = rsort(tags)

    this.asyncQuestions = [
      {
        type: 'list',
        name: 'phpVersion',
        message: 'PHP version',
        choices: tags,
        default: tags[0],
        store: true
      }
    ]
  }

  questions (): Question<Answers>[] {
    return [...this.asyncQuestions,
      {
        type: 'checkbox',
        name: 'phpExtensions',
        message: 'PHP Extensions',
        choices: ['xdebug', 'gd', 'opcache', 'ldap', 'zip'],
        default: ['xdebug'],
        store: true
      },
      {
        type: 'checkbox',
        name: 'phpTools',
        message: 'PHP Tools',
        choices: [
          { value: 'composer', name: 'Composer' },
          { value: 'symfony-client', name: 'Symfony client' },
          { value: 'phing', name: 'Phing' },
          { value: 'drupal-console', name: 'Drupal Console' },
          { value: 'drush-launcher', name: 'Drush Launcher' },
          'wkhtmltopdf'],
        default: ['composer'],
        store: true
      },
      {
        type: 'list',
        name: 'phpDrushGlobal',
        message: 'Drush global installation',
        when: (answers) => {
          answers = cleanupAnswers(answers)
          return answers.phpTools.indexOf('drush-launcher') > -1
        },
        choices: (answers) => {
          answers = cleanupAnswers(answers)

          const choices: ListChoiceOptions<Answers>[] = [
            {
              value: null,
              name: 'Do not install drush globally (recommanded, drush should be installed as a composer dependency of your drupal project)'
            },
            {
              value: 'composer',
              name: 'Install drush globally with composer',
              disabled: answers.phpTools.indexOf('composer') === -1 ? '"composer" should have been chosen in PHP Tools' : false
            },
            { value: 'phar', name: 'Install drush globally with PHAR (Drush 8 only)' }
          ]

          return choices
        },
        store: true
      },
      {
        type: 'list',
        name: 'phpDrushGlobalComposerVersion',
        message: 'Drush version',
        when: (answers) => {
          answers = cleanupAnswers(answers)
          return answers.phpDrushGlobal === 'composer'
        },
        choices: ['9', '8', '7', '6'],
        store: true
      }
    ]
  }

  get projectVolume () {
    return '/var/www/html'
  }

  postProcessAnswers (answers: AnswersFeature, answersFeatures: AnswersFeatures, allAnswers: AnswersFeatures[]): Questions<Answers> | null | undefined | void {
    const databaseChoicesByType: { [type: string]: ChoiceOptions<Answers>[] } = {}

    function add (type: string, value: ChoiceOptions<Answers>) {
      let choices: ChoiceOptions<Answers>[] | undefined = databaseChoicesByType[type]
      if (!choices) {
        choices = []
        databaseChoicesByType[type] = choices
      }
      choices.push(value)
    }

    for (const answersFeaturesGroup of allAnswers) {
      if (answersFeaturesGroup['postgresql']) {
        add('PostgreSQL', {
          value: JSON.stringify({
            client: 'PostgreSQL',
            package: 'postgresql-client',
            version: answersFeaturesGroup['postgresql']['postgresClientVersion']
          }),
          name: `postgresql (Version ${answersFeaturesGroup['postgresql']['postgresClientVersion']})`
        })
      }
      if (answersFeaturesGroup['mysql']) {
        add('MySQL',
          {
            value: JSON.stringify({
              client: 'MySQL',
              package: 'mysql-client',
              version: answersFeaturesGroup['mysql']['mysqlClientVersion']
            }),
            name: `mysql (Version ${answersFeaturesGroup['mysql']['mysqlClientVersion']})`
          })
      }
      if (answersFeaturesGroup['mariadb']) {
        add('MySQL', {
          value: JSON.stringify({
            client: 'MariaDB',
            package: 'mariadb-client',
            version: answersFeaturesGroup['mariadb']['mariadbClientVersion']
          }),
          name: `mariadb (Version ${answersFeaturesGroup['mariadb']['mariadbClientVersion']})`
        })
      }
    }

    if (!answers.nativeClient) {
      answers.nativeClient = []
    }

    if (Object.keys(databaseChoicesByType).length > 0) {
      const questions: Array<Question<Answers>> = []
      for (const type in databaseChoicesByType) {
        const databaseChoices = databaseChoicesByType[type]
        const choices: ChoiceOptions<Answers>[] = [{ value: null, name: 'No native client' }, ...databaseChoices]
        questions.push({
          type: 'list',
          name: 'nativeClient' + type,
          message: 'Native client for ' + type,
          choices,
          store: true
        })
      }

      return questions
    }
  }

  postProcessFeatureAnswers? (answers: AnswersFeature): void {
    for (const key in answers) {
      if (key.startsWith('nativeClient') && key !== 'nativeClient') {
        if (answers[key]) {
          let answer = typeof answers[key] === 'string' ? JSON.parse(answers[key]) as { client: string, package: string, version: string } : answers[key]
          answers.nativeClient.push(answer.client)
          answers[`nativeClient${answer.client}Package`] = answer.package
          answers[`nativeClient${answer.client}Version`] = answer.version
        }
      }
    }
  }

  private hasFeature (context: FeatureContext<this>, featureId: string) {
    for (const answersFeature of context.features) {
      {
        if (answersFeature[featureId]) {
          return true
        }
      }
    }
    return false
  }

  dockerComposeConfiguration (builder: ConfigBuilder, context: FeatureContext<this>, portsManager: PortsManager, dev?: boolean): void {
    if (!dev) {
      builder.service(context.instance.name)
        .with.default()
        .volume.project(this.projectVolume)
        .volume.relative('php-config.ini', '/usr/local/etc/php/conf.d/php-config.ini')

      if (this.hasFeature(context, 'mail')) {
        builder.service(context.instance.name)
          .volume.relative('msmtprc', '/etc/msmtprc')
      }

      if (context.phpTools.indexOf('composer') !== -1) {
        builder.service(context.instance.name)
          .volume.named(`${context.instance.name}-composer-cache`, '/composer/cache')
          .volume.named(`${context.instance.name}-composer-vendor`, '/composer/vendor')
      }
      builder.service(context.instance.name).ext(DockerDevboxExt).fixuid()
    } else {
      builder.service(context.instance.name)
        .ext(DockerDevboxExt).xdebug()
    }
  }

  writeOptions<O extends glob.IOptions & BulkOptions> (options: O, context: FeatureContext<this>, directory: string): O {
    if (!options.excludeFiles) {
      options.excludeFiles = []
    }

    if (context.phpTools.indexOf('composer') === -1) {
      options.excludeFiles.push('.bin/composer.hbs')
    }
    if (context.phpTools.indexOf('drupal-console') === -1) {
      options.excludeFiles.push('.bin/drupal.hbs')
    }
    if (context.phpTools.indexOf('drush-launcher') === -1) {
      options.excludeFiles.push('.bin/drush.hbs')
    }
    if (context.phpTools.indexOf('phing') === -1) {
      options.excludeFiles.push('.bin/phing.hbs')
    }
    if (context.phpTools.indexOf('symfony-client') === -1) {
      options.excludeFiles.push('.bin/symfony.hbs')
    }

    if (!this.hasFeature(context, 'mail')) {
      options.excludeFiles.push('.docker/[instance.name]/msmtprc.mo')
      options.excludeFiles.push('.docker/[instance.name]/.gitignore.hbs')
    }

    return options
  }
}

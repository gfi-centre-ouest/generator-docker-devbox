import { bash as _bash, ProcessOutput } from '../generators/app/system'
import { Feature } from '../generators/app/features/feature'
import {ChoiceType, QuestionOptions, objects} from 'inquirer'
import {Answers } from "yeoman-generator";
import { Dictionary } from 'yeoman-test'

export enum BuildOptionsChoiceType {
  NO,
  ALL
}

export async function bash (cmd: string): Promise<ProcessOutput> {
  try {
    const out = await _bash(cmd)
    return out
  } catch (e) {
    const err = e as ProcessOutput
    throw new Error(err.output.join(''))
  }
}

export function buildFeaturePrompts (featuresPrefix: string, pattern: BuildOptionsChoiceType, ...features: Feature[]): Dictionary<any> {
  const prompts: Dictionary<any> = {}
  for (const feature of features) {
    if (feature.questions) {
      const questions = feature.questions()
      for (const question of questions) {
        const questionOptions = question as QuestionOptions<Answers>
        const key = `${featuresPrefix}~${feature.name}~${question.name}`
        if (question.type === 'checkbox') {
          if (pattern === BuildOptionsChoiceType.ALL) {
            const values: ChoiceType<Answers>[] = []
            for (const choice of (questionOptions.choices as ReadonlyArray<ChoiceType<Answers>>)) {
              if (typeof choice === 'string') {
                values.push(choice)
              } else if (typeof choice === 'object') {
                const choiceOption = choice as objects.ChoiceOption<Answers>
                values.push(choiceOption.value)
              }
            }
            prompts[key] = values
          }
        }
      }
    }
  }
  return prompts
}

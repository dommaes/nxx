import { Dsl } from '../lib/types';

export interface ApplicationGeneratorSchema {
  name: string;
  tags?: string;
  directory?: string;
  dsl: Dsl;
  rootProjectName?: string;
  useInstalledGradle: boolean;
  gradleVersion?: string;
  skipFormat: boolean;
}

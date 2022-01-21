import { Dsl } from './types';

export function gradleFileOptions(dsl: Dsl): { gradleFileExt: string; quote: string } {
  if (dsl === Dsl.GROOVY) {
    return { gradleFileExt: '', quote: "'" };
  }
  return { gradleFileExt: '.kts', quote: '"' };
}

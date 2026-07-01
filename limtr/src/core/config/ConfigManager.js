import { DEFAULT_CONFIG } from './defaults.js';
import { validateConfig } from './validator.js';

export class ConfigManager {
  constructor(userConfig = {}) {
    validateConfig(userConfig);
    this.globalConfig = this.deepMerge({}, DEFAULT_CONFIG, userConfig);
  }

  deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
    return this.deepMerge(target, ...sources);
  }

  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item) && item !== null);
  }

  getConfigForRequest(reqDetails) {
    const overrides = this.globalConfig.overrides || [];
    
    for (const override of overrides) {
      if (typeof override.pattern === 'string' && reqDetails.path === override.pattern) {
        return this.deepMerge({}, this.globalConfig, { algorithm: override.config });
      }
      if (override.pattern instanceof RegExp && override.pattern.test(reqDetails.path)) {
        return this.deepMerge({}, this.globalConfig, { algorithm: override.config });
      }
    }
    
    return this.globalConfig;
  }
}

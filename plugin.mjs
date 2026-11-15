import { runScenarios } from './scenarios.mjs';
import { createLocalRoutes } from './local/service.mjs';
import { liveRoutes } from './live/config.mjs';
import manifest from './manifest.json' with { type: 'json' };

// Fusion's loader accepts a default-exported FusionPlugin object.
export default {
  manifest,
  state: 'installed',
  hooks: {},
  routes: [{
    method: 'GET',
    path: '/scenarios',
    description: 'Show synthetic task assessments and lifecycle decisions.',
    handler: async (_request, context) => runScenarios(context?.settings),
  }, ...createLocalRoutes(), ...liveRoutes],
};

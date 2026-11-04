import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

// The app still bootstraps with zone.js, so the tests need the zone-based
// environment rather than the zoneless one.
setupZoneTestEnv();

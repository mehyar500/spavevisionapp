#!/usr/bin/env tsx

/**
 * CloudFlare Manager Test Script
 * Tests basic CloudFlare Manager functionality including whoami
 * @version 1.0.0
 */

import { config } from 'dotenv';
import CloudFlareManager from './CloudFlareManager.js';

// Load environment variables
config();

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testWhoami() {
  console.log('🔍 Testing CloudFlare whoami...');

  try {
    const cfManager = new CloudFlareManager({
      environment: 'development',
      verbose: true,
      dryRun: false,
    });

    const user = await cfManager.whoami();
    console.log('✅ Current CloudFlare user:', user);

    return true;
  } catch (error) {
    console.error('❌ Whoami test failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testTokenVerification() {
  console.log('🔍 Testing CloudFlare API key verification...');

  try {
    const cfManager = new CloudFlareManager({
      environment: 'development',
      verbose: true,
      dryRun: false,
    });

    const isValid = await cfManager.verifyApiKey();
    console.log('✅ API key verification successful:', isValid);

    return true;
  } catch (error) {
    console.error(
      '❌ API key verification failed:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

async function testBasicListing() {
  console.log('🔍 Testing basic CloudFlare listing operations...');

  try {
    const cfManager = new CloudFlareManager({
      environment: 'development',
      verbose: true,
      dryRun: false,
    });

    // Test listing workers
    const workers = await cfManager.listWorkers();
    console.log('✅ Workers listed:', workers.length, 'found');

    // Test listing KV namespaces
    const kvNamespaces = await cfManager.listKVNamespaces();
    console.log('✅ KV namespaces listed:', kvNamespaces.length, 'found');

    // Test listing zones
    const zones = await cfManager.listZones();
    console.log('✅ Zones listed:', zones.length, 'found');

    return true;
  } catch (error) {
    console.error(
      '❌ Basic listing test failed:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

async function testOverallStatus() {
  console.log('🔍 Testing CloudFlare overall status...');

  try {
    const cfManager = new CloudFlareManager({
      environment: 'development',
      verbose: true,
      dryRun: false,
    });

    const status = await cfManager.getOverallStatus();
    console.log('✅ Overall status:', status);

    return true;
  } catch (error) {
    console.error(
      '❌ Overall status test failed:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('🚀 Starting CloudFlare Manager Tests...');
  console.log('='.repeat(50));

  const tests = [
    { name: 'Whoami', fn: testWhoami },
    { name: 'Token Verification', fn: testTokenVerification },
    { name: 'Basic Listing', fn: testBasicListing },
    { name: 'Overall Status', fn: testOverallStatus },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n📋 Running test: ${test.name}`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        console.log(`✅ ${test.name} passed`);
      } else {
        failed++;
        console.log(`❌ ${test.name} failed`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name} failed with error:`, error);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed. Check your CloudFlare configuration.');
    process.exit(1);
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

const command = process.argv[2];

switch (command) {
  case 'whoami':
    testWhoami();
    break;
  case 'token':
    testTokenVerification();
    break;
  case 'list':
    testBasicListing();
    break;
  case 'status':
    testOverallStatus();
    break;
  case 'all':
  default:
    runAllTests();
    break;
}

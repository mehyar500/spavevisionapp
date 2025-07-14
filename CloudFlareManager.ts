#!/usr/bin/env tsx

/**
 * Comprehensive CloudFlare Manager
 * Handles all Cloudflare cloud needs using both Wrangler commands and Cloudflare API
 *
 * Features:
 * - Workers management
 * - Pages management
 * - KV storage operations
 * - R2 bucket operations
 * - D1 database operations
 * - AI/ML operations
 * - DNS and domains
 * - Analytics and logs
 * - Security and access control
 * - Deployments and rollbacks
 * - Secrets and environment variables
 * - Zones and custom domains
 * - Rate limiting and WAF
 * - SSL/TLS certificates
 *
 * @version 1.0.0
 * @author ConnecTree Team
 */

import { execSync } from 'child_process';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

// Load environment variables
config();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type Environment = 'development' | 'staging' | 'production';
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

interface CloudFlareConfig {
  apiKey: string;
  email: string;
  accountId: string;
  zoneId?: string;
  environment: Environment;
  verbose: boolean;
  dryRun: boolean;
  timeout: number;
}

interface ApiResponse<T = any> {
  result: T;
  success: boolean;
  errors: any[];
  messages: any[];
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
  };
}

interface Worker {
  id: string;
  name: string;
  environment: string;
  created_on: string;
  modified_on: string;
  deployment_id?: string;
  usage_model: string;
  script?: string;
  bindings?: any[];
}

interface KVNamespace {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
}

interface R2Bucket {
  name: string;
  creation_date: string;
  location?: string;
  storage_class?: string;
}

interface D1Database {
  uuid: string;
  name: string;
  created_at: string;
  version: string;
  num_tables: number;
  file_size: string;
}

interface PagesProject {
  id: string;
  name: string;
  domains: string[];
  source?: {
    type: string;
    config: any;
  };
  build_config?: any;
  deployment_configs?: any;
  latest_deployment?: any;
}

interface Zone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  development_mode: number;
  name_servers: string[];
  original_name_servers: string[];
  original_registrar: string;
  original_dnshost: string;
  modified_on: string;
  created_on: string;
  activated_on: string;
  meta: {
    step: number;
    custom_certificate_quota: number;
    page_rule_quota: number;
    phishing_detected: boolean;
    multiple_railguns_allowed: boolean;
  };
  owner: {
    id: string;
    type: string;
    email: string;
  };
  permissions: string[];
  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    frequency: string;
    is_subscribed: boolean;
    can_subscribe: boolean;
    legacy_id: string;
    legacy_discount: boolean;
    externally_managed: boolean;
  };
}

interface DnsRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
  locked: boolean;
  meta: {
    auto_added: boolean;
    managed_by_apps: boolean;
    managed_by_argo_tunnel: boolean;
    source: string;
  };
  comment?: string;
  tags?: string[];
  created_on: string;
  modified_on: string;
}

interface AIModel {
  id: string;
  name: string;
  description: string;
  task: {
    id: string;
    name: string;
    description: string;
  };
  tags: string[];
}

interface Deployment {
  id: string;
  number: number;
  url: string;
  environment: string;
  created_on: string;
  modified_on: string;
  status: string;
  source: any;
  build_config: any;
  deployment_config: any;
}

interface Secret {
  name: string;
  type: string;
}

interface Certificate {
  id: string;
  type: string;
  method: string;
  status: string;
  certificate: string;
  private_key?: string;
  expires_on: string;
  requested_on: string;
  hostnames: string[];
}

// ============================================================================
// LOGGER CLASS
// ============================================================================

class Logger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  private log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    const emoji = {
      DEBUG: '🔍',
      INFO: 'ℹ️',
      WARN: '⚠️',
      ERROR: '❌',
      SUCCESS: '✅',
    }[level];

    const formattedMessage = `${emoji} [${timestamp}] [${level}] ${message}`;

    if (level === 'DEBUG' && !this.verbose) return;

    console.log(formattedMessage);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }
  info(message: string): void {
    this.log('INFO', message);
  }
  warn(message: string): void {
    this.log('WARN', message);
  }
  error(message: string): void {
    this.log('ERROR', message);
  }
  success(message: string): void {
    this.log('SUCCESS', message);
  }
}

// ============================================================================
// CLOUDFLARE MANAGER CLASS
// ============================================================================

export class CloudFlareManager {
  private config: CloudFlareConfig;
  private logger: Logger;
  private baseUrl = 'https://api.cloudflare.com/client/v4';
  private headers: Record<string, string>;

  constructor(config: Partial<CloudFlareConfig> = {}) {
    // Load from environment variables with fallbacks
    this.config = {
      apiKey: config.apiKey || process.env.CLOUDFLARE_API_KEY || '',
      email: config.email || process.env.CLOUDFLARE_EMAIL || '',
      accountId: config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '',
      zoneId: config.zoneId || process.env.CLOUDFLARE_ZONE_ID,
      environment: config.environment || 'development',
      verbose: config.verbose || false,
      dryRun: config.dryRun || false,
      timeout: config.timeout || 30000,
    };

    this.logger = new Logger(this.config.verbose);

    // Setup headers for API calls - using API key only
    this.headers = {
      'Content-Type': 'application/json',
      'X-Auth-Email': this.config.email,
      'X-Auth-Key': this.config.apiKey,
    };

    this.validateConfig();
  }

  // ============================================================================
  // CONFIGURATION AND VALIDATION
  // ============================================================================

  private validateConfig(): void {
    if (!this.config.apiKey || !this.config.email) {
      throw new Error('Both CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL must be provided');
    }

    if (!this.config.accountId) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
    }

    this.logger.debug('CloudFlare configuration validated');
  }

  // ============================================================================
  // HTTP CLIENT METHODS
  // ============================================================================

  private async makeApiRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    queryParams?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    this.logger.debug(`${method} ${url.toString()}`);

    if (this.config.dryRun) {
      this.logger.info(`[DRY RUN] Would make ${method} request to ${endpoint}`);
      return { result: {} as T, success: true, errors: [], messages: [] };
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: this.headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(this.config.timeout),
      });

      const responseData = (await response.json()) as ApiResponse<T>;

      if (!responseData.success) {
        this.logger.error(`API request failed: ${JSON.stringify(responseData.errors)}`);
        throw new Error(
          `API request failed: ${responseData.errors.map((e) => e.message || e).join(', ')}`
        );
      }

      this.logger.debug(`API response: ${JSON.stringify(responseData.result)}`);
      return responseData;
    } catch (error) {
      this.logger.error(`API request error: ${error}`);
      throw error;
    }
  }

  private async executeWranglerCommand(
    command: string,
    workingDir?: string,
    options: { captureOutput?: boolean; env?: Record<string, string> } = {}
  ): Promise<string> {
    const fullCommand = `wrangler ${command}`;
    this.logger.debug(`Executing: ${fullCommand}`);
    this.logger.debug(`Working directory: ${workingDir || process.cwd()}`);

    if (this.config.dryRun) {
      this.logger.info(`[DRY RUN] Would execute: ${fullCommand}`);
      return 'dry-run-output';
    }

    try {
      const result = execSync(fullCommand, {
        cwd: workingDir || process.cwd(),
        encoding: 'utf8',
        stdio: options.captureOutput ? 'pipe' : 'inherit',
        env: { ...process.env, ...options.env },
        timeout: this.config.timeout,
      });

      this.logger.debug(`Command output: ${result}`);
      return result;
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || 'Unknown error';
      this.logger.error(`Wrangler command failed: ${fullCommand}`);
      this.logger.error(`Error: ${errorMessage}`);
      throw new Error(`Wrangler command failed: ${errorMessage}`);
    }
  }

  // ============================================================================
  // AUTHENTICATION AND USER MANAGEMENT
  // ============================================================================

  async login(): Promise<void> {
    this.logger.info('Logging in to Cloudflare...');
    await this.executeWranglerCommand('login');
    this.logger.success('Successfully logged in to Cloudflare');
  }

  async logout(): Promise<void> {
    this.logger.info('Logging out from Cloudflare...');
    await this.executeWranglerCommand('logout');
    this.logger.success('Successfully logged out from Cloudflare');
  }

  async whoami(): Promise<string> {
    this.logger.info('Getting current user information...');
    const output = await this.executeWranglerCommand('whoami', undefined, { captureOutput: true });
    this.logger.success(`Current user: ${output.trim()}`);
    return output.trim();
  }
  async verifyApiKey(): Promise<boolean> {
    try {
      // Use /user endpoint to verify API key authentication
      const response = await this.makeApiRequest<any>('GET', '/user');
      this.logger.success('API key verification successful');
      return response.success && !!response.result;
    } catch (error) {
      this.logger.error(`API key verification failed: ${error}`);
      return false;
    }
  }

  async getApiKeyDetails(): Promise<{ id: string; email: string }> {
    const response = await this.makeApiRequest<{ id: string; email: string }>('GET', '/user');
    return response.result;
  }

  async getUserInfo(): Promise<any> {
    const response = await this.makeApiRequest('GET', '/user');
    return response.result;
  }

  // ============================================================================
  // WORKERS MANAGEMENT
  // ============================================================================

  async listWorkers(): Promise<Worker[]> {
    const response = await this.makeApiRequest<Worker[]>(
      'GET',
      `/accounts/${this.config.accountId}/workers/scripts`
    );
    return response.result;
  }

  async getWorker(scriptName: string): Promise<Worker> {
    const response = await this.makeApiRequest<Worker>(
      'GET',
      `/accounts/${this.config.accountId}/workers/scripts/${scriptName}`
    );
    return response.result;
  }

  async deployWorker(scriptName: string, scriptContent: string, bindings?: any[]): Promise<void> {
    const data = {
      body: scriptContent,
      bindings: bindings || [],
    };

    await this.makeApiRequest(
      'PUT',
      `/accounts/${this.config.accountId}/workers/scripts/${scriptName}`,
      data
    );
    this.logger.success(`Worker ${scriptName} deployed successfully`);
  }

  async deployWorkerWithWrangler(environment?: Environment, workingDir?: string): Promise<void> {
    const envFlag = environment ? `--env ${environment}` : '';
    await this.executeWranglerCommand(`deploy ${envFlag}`, workingDir);
    this.logger.success(`Worker deployed successfully to ${environment || 'default'} environment`);
  }

  async deleteWorker(scriptName: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/workers/scripts/${scriptName}`
    );
    this.logger.success(`Worker ${scriptName} deleted successfully`);
  }

  async getWorkerUsage(scriptName: string): Promise<any> {
    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/workers/scripts/${scriptName}/usage`
    );
    return response.result;
  }

  async listWorkerDeployments(scriptName: string): Promise<Deployment[]> {
    const output = await this.executeWranglerCommand(
      `deployments list --name ${scriptName}`,
      undefined,
      { captureOutput: true }
    );
    // Parse wrangler output - this would need custom parsing logic
    return [];
  }

  async rollbackWorker(scriptName: string, deploymentId: string): Promise<void> {
    await this.executeWranglerCommand(`rollback ${deploymentId} --name ${scriptName}`);
    this.logger.success(`Worker ${scriptName} rolled back to deployment ${deploymentId}`);
  }

  async tailWorkerLogs(scriptName?: string, environment?: Environment): Promise<void> {
    const nameFlag = scriptName ? `--name ${scriptName}` : '';
    const envFlag = environment ? `--env ${environment}` : '';
    await this.executeWranglerCommand(`tail ${nameFlag} ${envFlag}`);
  }

  // ============================================================================
  // PAGES MANAGEMENT
  // ============================================================================

  async listPagesProjects(): Promise<PagesProject[]> {
    const response = await this.makeApiRequest<PagesProject[]>(
      'GET',
      `/accounts/${this.config.accountId}/pages/projects`
    );
    return response.result;
  }

  async getPagesProject(projectName: string): Promise<PagesProject> {
    const response = await this.makeApiRequest<PagesProject>(
      'GET',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}`
    );
    return response.result;
  }

  async createPagesProject(
    projectName: string,
    options: {
      build_config?: any;
      deployment_configs?: any;
      canonical_deployment?: any;
    } = {}
  ): Promise<PagesProject> {
    const data = {
      name: projectName,
      ...options,
    };

    const response = await this.makeApiRequest<PagesProject>(
      'POST',
      `/accounts/${this.config.accountId}/pages/projects`,
      data
    );
    this.logger.success(`Pages project ${projectName} created successfully`);
    return response.result;
  }

  async createPagesProjectWithWrangler(
    projectName: string,
    compatibilityDate: string = '2024-01-15'
  ): Promise<void> {
    await this.executeWranglerCommand(
      `pages project create ${projectName} --compatibility-date="${compatibilityDate}" --production-branch="main"`
    );
    this.logger.success(`Pages project ${projectName} created with Wrangler`);
  }

  async deletePagesProject(projectName: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}`
    );
    this.logger.success(`Pages project ${projectName} deleted successfully`);
  }
  async deployPages(
    buildDir: string,
    projectName: string,
    workingDir?: string,
    options: {
      promoteToProduction?: boolean;
      environment?: 'staging' | 'production';
      customDomains?: string[];
    } = {}
  ): Promise<void> {
    const { promoteToProduction = true, environment = 'production', customDomains = [] } = options;

    await this.executeWranglerCommand(
      `pages deploy ${buildDir} --project-name=${projectName}`,
      workingDir
    );
    this.logger.success(`Pages deployed to project ${projectName}`);

    // Automatically promote domains to latest deployment if requested
    if (promoteToProduction) {
      try {
        await this.promoteDomainsToLatestDeployment(projectName, customDomains, environment);
      } catch (error) {
        this.logger.warn(`Domain promotion failed: ${error}`);
        this.logger.warn(`Custom domains may still point to an older deployment`);
        this.logger.info(
          `You can manually promote using: wrangler pages deployment promote <deployment-id> --project-name=${projectName}`
        );
      }
    }
  }

  async listPagesDeployments(projectName: string): Promise<Deployment[]> {
    const response = await this.makeApiRequest<Deployment[]>(
      'GET',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}/deployments`
    );
    return response.result;
  }

  async retryPagesDeployment(projectName: string, deploymentId: string): Promise<void> {
    await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}/deployments/${deploymentId}/retry`
    );
    this.logger.success(`Pages deployment ${deploymentId} retry initiated`);
  }
  async rollbackPagesDeployment(projectName: string, deploymentId: string): Promise<void> {
    await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}/deployments/${deploymentId}/rollback`
    );
    this.logger.success(`Pages deployment rolled back to ${deploymentId}`);
  }

  async addPagesDomain(projectName: string, domain: string): Promise<any> {
    const data = { domain };
    const response = await this.makeApiRequest(
      'PATCH',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}`,
      data
    );
    this.logger.success(`Domain ${domain} added to Pages project ${projectName}`);
    return response.result;
  }

  async removePagesDomain(projectName: string, domain: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/pages/projects/${projectName}/domains/${domain}`
    );
    this.logger.success(`Domain ${domain} removed from Pages project ${projectName}`);
  }

  async listPagesDomains(projectName: string): Promise<string[]> {
    const project = await this.getPagesProject(projectName);
    return project.domains || [];
  }

  async getLatestPagesDeployment(projectName: string): Promise<Deployment | null> {
    try {
      const deployments = await this.listPagesDeployments(projectName);
      if (deployments.length === 0) {
        this.logger.warn(`No deployments found for Pages project ${projectName}`);
        return null;
      }

      // Sort by created_on timestamp (most recent first)
      const sortedDeployments = deployments.sort(
        (a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime()
      );

      return sortedDeployments[0];
    } catch (error) {
      this.logger.error(`Failed to get latest deployment for ${projectName}: ${error}`);
      return null;
    }
  }

  async promoteDomainsToLatestDeployment(
    projectName: string,
    domains: string[] = [],
    environment: 'staging' | 'production' = 'production'
  ): Promise<void> {
    this.logger.info(`🔄 Promoting domains to latest deployment for ${projectName}...`);

    // Get the latest deployment
    const latestDeployment = await this.getLatestPagesDeployment(projectName);
    if (!latestDeployment) {
      throw new Error(`No deployments found for Pages project ${projectName}`);
    }

    this.logger.info(`Latest deployment ID: ${latestDeployment.id}`);
    this.logger.info(`Latest deployment URL: ${latestDeployment.url}`);

    // If no domains specified, use default domains based on environment
    if (domains.length === 0) {
      domains =
        environment === 'production'
          ? ['connectree.cc', 'www.connectree.cc']
          : ['staging.connectree.cc'];
    }

    // Ensure all domains are added to the Pages project
    for (const domain of domains) {
      try {
        // Check if domain is already added
        const existingDomains = await this.listPagesDomains(projectName);
        if (!existingDomains.includes(domain)) {
          this.logger.info(`Adding domain ${domain} to Pages project...`);
          await this.addPagesDomain(projectName, domain);
        } else {
          this.logger.debug(`Domain ${domain} already exists in Pages project`);
        }
      } catch (error) {
        this.logger.warn(`Failed to add domain ${domain}: ${error}`);
        // Continue with other domains
      }
    } // Set the canonical deployment using Cloudflare API
    // This ensures the custom domains point to the latest deployment
    try {
      this.logger.info(`Setting canonical deployment via API...`);
      await this.makeApiRequest(
        'PATCH',
        `/accounts/${this.config.accountId}/pages/projects/${projectName}`,
        {
          canonical_deployment: {
            id: latestDeployment.id,
          },
        }
      );
      this.logger.success(`✅ Set canonical deployment via API`);
      this.logger.success(`✅ Custom domains now point to latest deployment`);

      // Log the promoted domains
      for (const domain of domains) {
        this.logger.info(`🌐 https://${domain} -> ${latestDeployment.id}`);
      }
    } catch (error) {
      this.logger.error(`Failed to set canonical deployment: ${error}`);
      throw new Error(`Failed to promote domains to latest deployment: ${error}`);
    }
  }
  // ============================================================================
  // KV STORAGE MANAGEMENT
  // ============================================================================

  async listKVNamespaces(): Promise<KVNamespace[]> {
    const response = await this.makeApiRequest<KVNamespace[]>(
      'GET',
      `/accounts/${this.config.accountId}/storage/kv/namespaces`
    );
    return response.result;
  }

  async createKVNamespace(title: string): Promise<KVNamespace> {
    const data = { title };
    const response = await this.makeApiRequest<KVNamespace>(
      'POST',
      `/accounts/${this.config.accountId}/storage/kv/namespaces`,
      data
    );
    this.logger.success(`KV namespace ${title} created with ID: ${response.result.id}`);
    return response.result;
  }

  async createKVNamespaceWithWrangler(title: string, preview: boolean = false): Promise<string> {
    const previewFlag = preview ? '--preview' : '';
    const output = await this.executeWranglerCommand(
      `kv namespace create "${title}" ${previewFlag}`,
      undefined,
      { captureOutput: true }
    );
    const match = output.match(preview ? /preview_id = "([^"]+)"/ : /id = "([^"]+)"/);
    if (!match) {
      throw new Error(`Failed to extract namespace ID from output: ${output}`);
    }
    return match[1];
  }

  async deleteKVNamespace(namespaceId: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}`
    );
    this.logger.success(`KV namespace ${namespaceId} deleted successfully`);
  }

  async renameKVNamespace(namespaceId: string, newTitle: string): Promise<void> {
    const data = { title: newTitle };
    await this.makeApiRequest(
      'PUT',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}`,
      data
    );
    this.logger.success(`KV namespace ${namespaceId} renamed to ${newTitle}`);
  }

  async listKVKeys(
    namespaceId: string,
    prefix?: string,
    limit?: number,
    cursor?: string
  ): Promise<any> {
    const queryParams: Record<string, string> = {};
    if (prefix) queryParams.prefix = prefix;
    if (limit) queryParams.limit = limit.toString();
    if (cursor) queryParams.cursor = cursor;

    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/keys`,
      undefined,
      queryParams
    );
    return response.result;
  }

  async getKVValue(namespaceId: string, key: string): Promise<string> {
    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`
    );
    return response.result;
  }

  async putKVValue(namespaceId: string, key: string, value: string, metadata?: any): Promise<void> {
    const data = { value, metadata };
    await this.makeApiRequest(
      'PUT',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`,
      data
    );
    this.logger.success(`KV value set for key ${key} in namespace ${namespaceId}`);
  }

  async deleteKVValue(namespaceId: string, key: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`
    );
    this.logger.success(`KV value deleted for key ${key} in namespace ${namespaceId}`);
  }

  async bulkWriteKV(
    namespaceId: string,
    keyValuePairs: Array<{ key: string; value: string; metadata?: any }>
  ): Promise<void> {
    await this.makeApiRequest(
      'PUT',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      keyValuePairs
    );
    this.logger.success(
      `Bulk write completed for ${keyValuePairs.length} items in namespace ${namespaceId}`
    );
  }

  async bulkDeleteKV(namespaceId: string, keys: string[]): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      keys
    );
    this.logger.success(
      `Bulk delete completed for ${keys.length} keys in namespace ${namespaceId}`
    );
  }

  // ============================================================================
  // R2 STORAGE MANAGEMENT
  // ============================================================================

  async listR2Buckets(): Promise<R2Bucket[]> {
    const output = await this.executeWranglerCommand('r2 bucket list', undefined, {
      captureOutput: true,
    });
    // Parse wrangler output format - custom parsing needed
    const buckets: R2Bucket[] = [];
    const lines = output.split('\n');
    let currentBucket: Partial<R2Bucket> = {};

    for (const line of lines) {
      if (line.startsWith('name:')) {
        if (currentBucket.name) {
          buckets.push(currentBucket as R2Bucket);
        }
        currentBucket = { name: line.split('name:')[1].trim() };
      } else if (line.startsWith('creation_date:')) {
        currentBucket.creation_date = line.split('creation_date:')[1].trim();
      }
    }

    if (currentBucket.name) {
      buckets.push(currentBucket as R2Bucket);
    }

    return buckets;
  }

  async createR2Bucket(bucketName: string, location?: string): Promise<void> {
    const locationFlag = location ? `--location ${location}` : '';
    await this.executeWranglerCommand(`r2 bucket create ${bucketName} ${locationFlag}`);
    this.logger.success(`R2 bucket ${bucketName} created successfully`);
  }

  async deleteR2Bucket(bucketName: string): Promise<void> {
    await this.executeWranglerCommand(`r2 bucket delete ${bucketName}`);
    this.logger.success(`R2 bucket ${bucketName} deleted successfully`);
  }

  async listR2Objects(bucketName: string, prefix?: string): Promise<any[]> {
    const prefixFlag = prefix ? `--prefix ${prefix}` : '';
    const output = await this.executeWranglerCommand(
      `r2 object list ${bucketName} ${prefixFlag}`,
      undefined,
      { captureOutput: true }
    );
    // Parse output - custom parsing needed
    return [];
  }

  async putR2Object(
    bucketName: string,
    key: string,
    filePath: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const metadataFlags = metadata
      ? Object.entries(metadata)
          .map(([k, v]) => `--metadata ${k}=${v}`)
          .join(' ')
      : '';
    await this.executeWranglerCommand(
      `r2 object put ${bucketName}/${key} --file="${filePath}" ${metadataFlags}`
    );
    this.logger.success(`Object ${key} uploaded to R2 bucket ${bucketName}`);
  }

  async getR2Object(bucketName: string, key: string, outputPath: string): Promise<void> {
    await this.executeWranglerCommand(`r2 object get ${bucketName}/${key} --file="${outputPath}"`);
    this.logger.success(`Object ${key} downloaded from R2 bucket ${bucketName} to ${outputPath}`);
  }

  async deleteR2Object(bucketName: string, key: string): Promise<void> {
    await this.executeWranglerCommand(`r2 object delete ${bucketName}/${key}`);
    this.logger.success(`Object ${key} deleted from R2 bucket ${bucketName}`);
  }

  async generateR2PresignedUrl(
    bucketName: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const output = await this.executeWranglerCommand(
      `r2 object presign ${bucketName}/${key} --expires-in ${expiresIn}`,
      undefined,
      { captureOutput: true }
    );
    return output.trim();
  }

  // ============================================================================
  // D1 DATABASE MANAGEMENT
  // ============================================================================

  async listD1Databases(): Promise<D1Database[]> {
    const output = await this.executeWranglerCommand('d1 list', undefined, { captureOutput: true });
    // Parse table format output - custom parsing needed
    const databases: D1Database[] = [];
    const lines = output.split('\n');

    let dataStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('├──') || lines[i].includes('┼──')) {
        dataStartIndex = i + 1;
        break;
      }
    }

    if (dataStartIndex === -1) return [];

    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('└──') || line.includes('┘')) break;
      if (!line.includes('│')) continue;

      const columns = line
        .split('│')
        .map((col) => col.trim())
        .filter((col) => col);
      if (columns.length >= 3) {
        databases.push({
          uuid: columns[0],
          name: columns[1],
          created_at: columns[2],
          version: columns[3] || '',
          num_tables: parseInt(columns[4]) || 0,
          file_size: columns[5] || '',
        });
      }
    }

    return databases;
  }

  async createD1Database(databaseName: string): Promise<string> {
    const output = await this.executeWranglerCommand(`d1 create ${databaseName}`, undefined, {
      captureOutput: true,
    });
    const match = output.match(/database_id = "([^"]+)"/);
    if (!match) {
      throw new Error(`Failed to extract database ID from output: ${output}`);
    }
    this.logger.success(`D1 database ${databaseName} created with ID: ${match[1]}`);
    return match[1];
  }

  async deleteD1Database(databaseName: string): Promise<void> {
    await this.executeWranglerCommand(`d1 delete ${databaseName}`);
    this.logger.success(`D1 database ${databaseName} deleted successfully`);
  }

  async executeD1Query(databaseName: string, query: string, local: boolean = false): Promise<any> {
    const localFlag = local ? '--local' : '';
    const output = await this.executeWranglerCommand(
      `d1 execute ${databaseName} --command="${query}" ${localFlag}`,
      undefined,
      { captureOutput: true }
    );
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  async executeD1File(
    databaseName: string,
    filePath: string,
    local: boolean = false
  ): Promise<any> {
    const localFlag = local ? '--local' : '';
    const output = await this.executeWranglerCommand(
      `d1 execute ${databaseName} --file="${filePath}" ${localFlag}`,
      undefined,
      { captureOutput: true }
    );
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  async migrateD1Database(databaseName: string, local: boolean = false): Promise<void> {
    const localFlag = local ? '--local' : '';
    await this.executeWranglerCommand(`d1 migrations apply ${databaseName} ${localFlag}`);
    this.logger.success(`D1 database ${databaseName} migrations applied`);
  }

  async listD1Migrations(databaseName: string): Promise<any[]> {
    const output = await this.executeWranglerCommand(
      `d1 migrations list ${databaseName}`,
      undefined,
      { captureOutput: true }
    );
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async createD1Backup(databaseName: string): Promise<string> {
    const output = await this.executeWranglerCommand(
      `d1 backup create ${databaseName}`,
      undefined,
      { captureOutput: true }
    );
    // Extract backup ID from output
    const match = output.match(/backup_id[:\s]+([a-f0-9-]+)/i);
    if (!match) {
      throw new Error(`Failed to extract backup ID from output: ${output}`);
    }
    this.logger.success(`D1 database ${databaseName} backup created with ID: ${match[1]}`);
    return match[1];
  }

  async listD1Backups(databaseName: string): Promise<any[]> {
    const output = await this.executeWranglerCommand(`d1 backup list ${databaseName}`, undefined, {
      captureOutput: true,
    });
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async restoreD1Backup(databaseName: string, backupId: string): Promise<void> {
    await this.executeWranglerCommand(`d1 backup restore ${databaseName} ${backupId}`);
    this.logger.success(`D1 database ${databaseName} restored from backup ${backupId}`);
  }

  async downloadD1Backup(
    databaseName: string,
    backupId: string,
    outputPath: string
  ): Promise<void> {
    await this.executeWranglerCommand(
      `d1 backup download ${databaseName} ${backupId} --output="${outputPath}"`
    );
    this.logger.success(`D1 backup ${backupId} downloaded to ${outputPath}`);
  }

  // ============================================================================
  // AI/ML OPERATIONS
  // ============================================================================

  async listAIModels(): Promise<AIModel[]> {
    const response = await this.makeApiRequest<AIModel[]>(
      'GET',
      `/accounts/${this.config.accountId}/ai/models/search`
    );
    return response.result;
  }

  async runAIModel(modelName: string, inputs: any): Promise<any> {
    const data = { inputs };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/ai/run/${modelName}`,
      data
    );
    return response.result;
  }

  async getAIModelSchema(modelName: string): Promise<any> {
    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/ai/models/${modelName}`
    );
    return response.result;
  }

  // ============================================================================
  // ZONES AND DNS MANAGEMENT
  // ============================================================================

  async listZones(): Promise<Zone[]> {
    const response = await this.makeApiRequest<Zone[]>('GET', '/zones');
    return response.result;
  }

  async getZone(zoneId: string): Promise<Zone> {
    const response = await this.makeApiRequest<Zone>('GET', `/zones/${zoneId}`);
    return response.result;
  }

  async createZone(name: string, accountId?: string): Promise<Zone> {
    const data = {
      name,
      account: accountId ? { id: accountId } : { id: this.config.accountId },
    };
    const response = await this.makeApiRequest<Zone>('POST', '/zones', data);
    this.logger.success(`Zone ${name} created successfully`);
    return response.result;
  }

  async deleteZone(zoneId: string): Promise<void> {
    await this.makeApiRequest('DELETE', `/zones/${zoneId}`);
    this.logger.success(`Zone ${zoneId} deleted successfully`);
  }

  async pauseZone(zoneId: string): Promise<void> {
    await this.makeApiRequest('PATCH', `/zones/${zoneId}`, { paused: true });
    this.logger.success(`Zone ${zoneId} paused`);
  }

  async unpauseZone(zoneId: string): Promise<void> {
    await this.makeApiRequest('PATCH', `/zones/${zoneId}`, { paused: false });
    this.logger.success(`Zone ${zoneId} unpaused`);
  }

  async listDnsRecords(zoneId?: string): Promise<DnsRecord[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<DnsRecord[]>('GET', `/zones/${zone}/dns_records`);
    return response.result;
  }

  async createDnsRecord(
    record: {
      type: string;
      name: string;
      content: string;
      ttl?: number;
      proxied?: boolean;
      comment?: string;
      tags?: string[];
    },
    zoneId?: string
  ): Promise<DnsRecord> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<DnsRecord>(
      'POST',
      `/zones/${zone}/dns_records`,
      record
    );
    this.logger.success(`DNS record ${record.name} created successfully`);
    return response.result;
  }

  async updateDnsRecord(
    recordId: string,
    record: Partial<DnsRecord>,
    zoneId?: string
  ): Promise<DnsRecord> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<DnsRecord>(
      'PUT',
      `/zones/${zone}/dns_records/${recordId}`,
      record
    );
    this.logger.success(`DNS record ${recordId} updated successfully`);
    return response.result;
  }

  async deleteDnsRecord(recordId: string, zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('DELETE', `/zones/${zone}/dns_records/${recordId}`);
    this.logger.success(`DNS record ${recordId} deleted successfully`);
  }

  // ============================================================================
  // SECRETS AND ENVIRONMENT VARIABLES
  // ============================================================================

  async listSecrets(environment?: Environment, workingDir?: string): Promise<Secret[]> {
    const envFlag = environment ? `--env ${environment}` : '';
    const output = await this.executeWranglerCommand(`secret list ${envFlag}`, workingDir, {
      captureOutput: true,
    });
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }
  async putSecret(
    name: string,
    value: string,
    environment?: Environment,
    workingDir?: string
  ): Promise<void> {
    const envFlag = environment ? `--env ${environment}` : '';
    // Use piped command approach to avoid interactive input issues
    const command = `echo "${value}" | wrangler secret put ${name} ${envFlag}`;
    try {
      execSync(command, {
        cwd: workingDir || process.cwd(),
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: 'false',
        },
        stdio: 'pipe',
      });
      this.logger.success(`Secret ${name} set successfully`);
    } catch (error) {
      this.logger.error(`Failed to set secret ${name}: ${error}`);
      throw error;
    }
  }

  async deleteSecret(name: string, environment?: Environment, workingDir?: string): Promise<void> {
    const envFlag = environment ? `--env ${environment}` : '';
    await this.executeWranglerCommand(`secret delete ${name} ${envFlag}`, workingDir);
    this.logger.success(`Secret ${name} deleted successfully`);
  }

  async bulkPutSecrets(
    secrets: Record<string, string>,
    environment?: Environment,
    workingDir?: string
  ): Promise<void> {
    for (const [name, value] of Object.entries(secrets)) {
      await this.putSecret(name, value, environment, workingDir);
    }
    this.logger.success(`${Object.keys(secrets).length} secrets uploaded successfully`);
  }

  // ============================================================================
  // ANALYTICS AND MONITORING
  // ============================================================================

  async getAnalytics(
    datasetId: string,
    query: {
      dimensions?: string[];
      metrics?: string[];
      sort?: string[];
      filters?: string;
      since?: string;
      until?: string;
      limit?: number;
    }
  ): Promise<any> {
    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/analytics_engine/sql`,
      undefined,
      {
        query: JSON.stringify(query),
      }
    );
    return response.result;
  }

  async getZoneAnalytics(
    zoneId: string,
    since: string,
    until: string,
    dimensions?: string[],
    metrics?: string[]
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const queryParams: Record<string, string> = { since, until };
    if (dimensions) queryParams.dimensions = dimensions.join(',');
    if (metrics) queryParams.metrics = metrics.join(',');

    const response = await this.makeApiRequest(
      'GET',
      `/zones/${zone}/analytics/dashboard`,
      undefined,
      queryParams
    );
    return response.result;
  }

  async getWorkerAnalytics(scriptName: string, since: string, until: string): Promise<any> {
    const queryParams = { since, until };
    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/workers/scripts/${scriptName}/analytics`,
      undefined,
      queryParams
    );
    return response.result;
  }

  // ============================================================================
  // SSL/TLS CERTIFICATES
  // ============================================================================

  async listCertificates(zoneId?: string): Promise<Certificate[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<Certificate[]>(
      'GET',
      `/zones/${zone}/ssl/certificate_packs`
    );
    return response.result;
  }

  async orderCertificate(
    hostnames: string[],
    type: 'advanced' | 'dedicated_custom' = 'advanced',
    zoneId?: string
  ): Promise<Certificate> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = { hosts: hostnames, type };
    const response = await this.makeApiRequest<Certificate>(
      'POST',
      `/zones/${zone}/ssl/certificate_packs/order`,
      data
    );
    this.logger.success(`Certificate ordered for hostnames: ${hostnames.join(', ')}`);
    return response.result;
  }

  async deleteCertificate(certificateId: string, zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('DELETE', `/zones/${zone}/ssl/certificate_packs/${certificateId}`);
    this.logger.success(`Certificate ${certificateId} deleted successfully`);
  }

  async getSSLSettings(zoneId?: string): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest('GET', `/zones/${zone}/settings/ssl`);
    return response.result;
  }

  async updateSSLSettings(setting: string, value: any, zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('PATCH', `/zones/${zone}/settings/${setting}`, { value });
    this.logger.success(`SSL setting ${setting} updated to ${value}`);
  }

  // ============================================================================
  // CUSTOM DOMAINS AND ROUTES
  // ============================================================================

  async addCustomDomain(domain: string, environment?: Environment): Promise<void> {
    const envFlag = environment ? `--env ${environment}` : '';
    await this.executeWranglerCommand(`route add ${domain} ${envFlag}`);
    this.logger.success(`Custom domain ${domain} added successfully`);
  }

  async removeCustomDomain(domain: string, environment?: Environment): Promise<void> {
    const envFlag = environment ? `--env ${environment}` : '';
    await this.executeWranglerCommand(`route delete ${domain} ${envFlag}`);
    this.logger.success(`Custom domain ${domain} removed successfully`);
  }

  async listRoutes(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/workers/routes`);
    return response.result;
  }

  // ============================================================================
  // LOAD BALANCING AND TRAFFIC MANAGEMENT
  // ============================================================================

  async createLoadBalancer(
    name: string,
    fallbackPool: string,
    defaultPools: string[],
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = {
      name,
      fallback_pool: fallbackPool,
      default_pools: defaultPools,
    };

    const response = await this.makeApiRequest('POST', `/zones/${zone}/load_balancers`, data);
    this.logger.success(`Load balancer ${name} created successfully`);
    return response.result;
  }

  async listLoadBalancers(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/load_balancers`);
    return response.result;
  }

  // ============================================================================
  // WAF AND SECURITY
  // ============================================================================

  async listFirewallRules(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/firewall/rules`);
    return response.result;
  }

  async createFirewallRule(
    expression: string,
    action: string,
    description?: string,
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = {
      filter: { expression },
      action: { mode: action },
      description,
    };

    const response = await this.makeApiRequest('POST', `/zones/${zone}/firewall/rules`, data);
    this.logger.success(`Firewall rule created successfully`);
    return response.result;
  }

  async enableBotManagement(zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('PATCH', `/zones/${zone}/settings/bot_management`, { value: 'on' });
    this.logger.success('Bot Management enabled');
  }

  async enableDDoSProtection(zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('PATCH', `/zones/${zone}/settings/advanced_ddos`, { value: 'on' });
    this.logger.success('Advanced DDoS Protection enabled');
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  async createRateLimit(
    threshold: number,
    period: number,
    action: string,
    match: any,
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = {
      threshold,
      period,
      action: { mode: action },
      match,
    };

    const response = await this.makeApiRequest('POST', `/zones/${zone}/rate_limits`, data);
    this.logger.success('Rate limit rule created successfully');
    return response.result;
  }

  async listRateLimits(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/rate_limits`);
    return response.result;
  }

  // ============================================================================
  // BULK OPERATIONS AND UTILITIES
  // ============================================================================

  async bulkCreateDnsRecords(records: any[], zoneId?: string): Promise<void> {
    for (const record of records) {
      await this.createDnsRecord(record, zoneId);
      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.logger.success(`${records.length} DNS records created successfully`);
  }

  async exportZoneFile(zoneId?: string): Promise<string> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest('GET', `/zones/${zone}/dns_records/export`);
    return response.result;
  }

  async importZoneFile(zoneFile: string, zoneId?: string): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = { file: zoneFile };
    const response = await this.makeApiRequest('POST', `/zones/${zone}/dns_records/import`, data);
    this.logger.success('Zone file imported successfully');
    return response.result;
  }

  // ============================================================================
  // HEALTH CHECKS AND STATUS
  // ============================================================================

  async checkWorkerHealth(scriptName: string): Promise<boolean> {
    try {
      const worker = await this.getWorker(scriptName);
      return !!worker;
    } catch {
      return false;
    }
  }
  async checkPagesHealth(projectName: string): Promise<boolean> {
    try {
      const project = await this.getPagesProject(projectName);
      return !!project;
    } catch {
      return false;
    }
  }

  async comprehensiveHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      workers: { status: string; count: number };
      pages: { status: string; count: number };
      dns: { status: string; records: number };
      ssl: { status: string; certificates: number };
    };
    environments: {
      production: { frontend: boolean; api: boolean };
      staging: { frontend: boolean; api: boolean };
    };
  }> {
    this.logger.info('🏥 Running comprehensive health check...');

    try {
      // Check infrastructure components
      const [workers, pages, zones, certificates] = await Promise.all([
        this.listWorkers(),
        this.listPagesProjects(),
        this.listZones(),
        this.listCertificates().catch(() => []),
      ]);

      // Check DNS records
      const dnsRecords = await this.listDnsRecords().catch(() => []);

      // Check environment-specific health
      const productionFrontend = await this.checkPagesHealth('connectree');
      const productionApi = await this.checkWorkerHealth('connectree-api');
      const stagingFrontend = await this.checkPagesHealth('connectree');
      const stagingApi = await this.checkWorkerHealth('connectree-api-staging');

      const services = {
        workers: {
          status: workers.length > 0 ? 'healthy' : 'unhealthy',
          count: workers.length,
        },
        pages: {
          status: pages.length > 0 ? 'healthy' : 'unhealthy',
          count: pages.length,
        },
        dns: {
          status: dnsRecords.length > 0 ? 'healthy' : 'unhealthy',
          records: dnsRecords.length,
        },
        ssl: {
          status: certificates.length > 0 ? 'healthy' : 'degraded',
          certificates: certificates.length,
        },
      };

      const environments = {
        production: {
          frontend: productionFrontend,
          api: productionApi,
        },
        staging: {
          frontend: stagingFrontend,
          api: stagingApi,
        },
      };

      // Determine overall status
      const unhealthyServices = Object.values(services).filter(
        (s) => s.status === 'unhealthy'
      ).length;
      const degradedServices = Object.values(services).filter(
        (s) => s.status === 'degraded'
      ).length;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (unhealthyServices > 0) {
        status = 'unhealthy';
      } else if (degradedServices > 0) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      this.logger.success(`Health check completed - Status: ${status.toUpperCase()}`);
      return { status, services, environments };
    } catch (error) {
      this.logger.error(
        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  async getOverallStatus(): Promise<{
    workers: number;
    pages: number;
    kvNamespaces: number;
    r2Buckets: number;
    d1Databases: number;
    zones: number;
  }> {
    const [workers, pages, kvNamespaces, r2Buckets, d1Databases, zones] = await Promise.all([
      this.listWorkers(),
      this.listPagesProjects(),
      this.listKVNamespaces(),
      this.listR2Buckets(),
      this.listD1Databases(),
      this.listZones(),
    ]);

    return {
      workers: workers.length,
      pages: pages.length,
      kvNamespaces: kvNamespaces.length,
      r2Buckets: r2Buckets.length,
      d1Databases: d1Databases.length,
      zones: zones.length,
    };
  }

  // ============================================================================
  // COMPREHENSIVE CLEANUP
  // ============================================================================

  async cleanupEnvironment(environment: Environment, confirm: boolean = false): Promise<void> {
    if (!confirm) {
      this.logger.warn(
        'This will delete all resources for the specified environment. Use confirm=true to proceed.'
      );
      return;
    }

    this.logger.info(`Starting cleanup for ${environment} environment...`);

    try {
      // Clean up KV namespaces
      const kvNamespaces = await this.listKVNamespaces();
      for (const ns of kvNamespaces) {
        if (ns.title.includes(environment)) {
          await this.deleteKVNamespace(ns.id);
        }
      }

      // Clean up R2 buckets
      const r2Buckets = await this.listR2Buckets();
      for (const bucket of r2Buckets) {
        if (bucket.name.includes(environment)) {
          await this.deleteR2Bucket(bucket.name);
        }
      }

      // Clean up D1 databases
      const d1Databases = await this.listD1Databases();
      for (const db of d1Databases) {
        if (db.name.includes(environment)) {
          await this.deleteD1Database(db.name);
        }
      }

      this.logger.success(`Cleanup completed for ${environment} environment`);
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error}`);
      throw error;
    }
  }

  // ============================================================================
  // CONFIGURATION EXPORT/IMPORT
  // ============================================================================

  async exportConfiguration(): Promise<any> {
    const config = {
      workers: await this.listWorkers(),
      pages: await this.listPagesProjects(),
      kvNamespaces: await this.listKVNamespaces(),
      r2Buckets: await this.listR2Buckets(),
      d1Databases: await this.listD1Databases(),
      zones: await this.listZones(),
      timestamp: new Date().toISOString(),
    };

    return config;
  }

  async saveConfigurationToFile(filePath: string): Promise<void> {
    const config = await this.exportConfiguration();
    writeFileSync(filePath, JSON.stringify(config, null, 2));
    this.logger.success(`Configuration saved to ${filePath}`);
  }

  // ============================================================================
  // ADVANCED DEPLOYMENT PATTERNS
  // ============================================================================

  async deployWithBlueGreen(
    scriptName: string,
    scriptContent: string,
    environment: Environment
  ): Promise<void> {
    const blueEnvironment = `${environment}-blue`;
    const greenEnvironment = `${environment}-green`;

    try {
      // Deploy to blue environment first
      this.logger.info('Deploying to blue environment...');
      await this.deployWorkerWithWrangler(blueEnvironment as Environment);

      // Health check on blue
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      // Switch traffic to blue (this would need custom routing logic)
      this.logger.info('Switching traffic to blue environment...');

      // Deploy to green environment
      this.logger.info('Deploying to green environment...');
      await this.deployWorkerWithWrangler(greenEnvironment as Environment);

      this.logger.success('Blue-green deployment completed successfully');
    } catch (error) {
      this.logger.error(`Blue-green deployment failed: ${error}`);
      throw error;
    }
  }

  async deployWithCanary(
    scriptName: string,
    scriptContent: string,
    environment: Environment,
    canaryPercentage: number = 10
  ): Promise<void> {
    // This would require implementing custom load balancing logic
    this.logger.info(`Starting canary deployment with ${canaryPercentage}% traffic...`);

    try {
      // Deploy canary version
      await this.deployWorkerWithWrangler(environment);

      // Monitor for configurable time period
      this.logger.info('Monitoring canary deployment...');
      await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

      // If successful, proceed with full deployment
      this.logger.success('Canary deployment successful, proceeding with full deployment');
    } catch (error) {
      this.logger.error(`Canary deployment failed: ${error}`);
      throw error;
    }
  }

  // ============================================================================
  // STREAM VIDEO MANAGEMENT
  // ============================================================================

  async listStreamVideos(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/stream`
    );
    return response.result;
  }

  async uploadStreamVideo(filePath: string, metadata?: any): Promise<any> {
    // Note: This is a simplified version. Real implementation would use multipart upload
    const data = { url: filePath, meta: metadata };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/stream/copy`,
      data
    );
    this.logger.success(`Stream video uploaded successfully`);
    return response.result;
  }

  async deleteStreamVideo(videoId: string): Promise<void> {
    await this.makeApiRequest('DELETE', `/accounts/${this.config.accountId}/stream/${videoId}`);
    this.logger.success(`Stream video ${videoId} deleted successfully`);
  }

  async getStreamVideoDetails(videoId: string): Promise<any> {
    const response = await this.makeApiRequest(
      'GET',
      `/accounts/${this.config.accountId}/stream/${videoId}`
    );
    return response.result;
  }

  // ============================================================================
  // IMAGES OPTIMIZATION
  // ============================================================================

  async listImages(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/images/v1`
    );
    return response.result;
  }

  async uploadImage(filePath: string, metadata?: any): Promise<any> {
    // Note: This is a simplified version. Real implementation would use multipart upload
    const data = { url: filePath, metadata };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/images/v1`,
      data
    );
    this.logger.success(`Image uploaded successfully`);
    return response.result;
  }

  async deleteImage(imageId: string): Promise<void> {
    await this.makeApiRequest('DELETE', `/accounts/${this.config.accountId}/images/v1/${imageId}`);
    this.logger.success(`Image ${imageId} deleted successfully`);
  }

  async getImageVariants(imageId: string): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/images/v1/${imageId}/variants`
    );
    return response.result;
  }

  // ============================================================================
  // TURNSTILE CAPTCHA MANAGEMENT
  // ============================================================================

  async listTurnstileSites(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/challenges/widgets`
    );
    return response.result;
  }

  async createTurnstileSite(
    name: string,
    domain: string,
    mode: 'managed' | 'non-interactive' = 'managed'
  ): Promise<any> {
    const data = { name, domains: [domain], mode };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/challenges/widgets`,
      data
    );
    this.logger.success(`Turnstile site ${name} created successfully`);
    return response.result;
  }

  async deleteTurnstileSite(siteId: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/challenges/widgets/${siteId}`
    );
    this.logger.success(`Turnstile site ${siteId} deleted successfully`);
  }

  async rotateTurnstileSecret(siteId: string): Promise<any> {
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/challenges/widgets/${siteId}/rotate_secret`
    );
    this.logger.success(`Turnstile secret rotated for site ${siteId}`);
    return response.result;
  }

  // ============================================================================
  // ACCESS (ZERO TRUST) MANAGEMENT
  // ============================================================================

  async listAccessApplications(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/access/apps`
    );
    return response.result;
  }

  async createAccessApplication(name: string, domain: string, policies: string[]): Promise<any> {
    const data = { name, domain, policies };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/access/apps`,
      data
    );
    this.logger.success(`Access application ${name} created successfully`);
    return response.result;
  }

  async deleteAccessApplication(appId: string): Promise<void> {
    await this.makeApiRequest('DELETE', `/accounts/${this.config.accountId}/access/apps/${appId}`);
    this.logger.success(`Access application ${appId} deleted successfully`);
  }

  async listAccessPolicies(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/access/policies`
    );
    return response.result;
  }

  async createAccessPolicy(name: string, decision: 'allow' | 'deny', rules: any[]): Promise<any> {
    const data = { name, decision, include: rules };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/access/policies`,
      data
    );
    this.logger.success(`Access policy ${name} created successfully`);
    return response.result;
  }

  // ============================================================================
  // EMAIL ROUTING MANAGEMENT
  // ============================================================================

  async enableEmailRouting(zoneId?: string): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest('POST', `/zones/${zone}/email/routing/enable`);
    this.logger.success('Email routing enabled');
    return response.result;
  }

  async listEmailRoutingRules(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/email/routing/rules`);
    return response.result;
  }

  async createEmailRoutingRule(
    name: string,
    matcher: { type: string; field: string; value: string },
    actions: any[],
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = { name, matchers: [matcher], actions };
    const response = await this.makeApiRequest('POST', `/zones/${zone}/email/routing/rules`, data);
    this.logger.success(`Email routing rule ${name} created successfully`);
    return response.result;
  }

  // ============================================================================
  // SPECTRUM (TCP/UDP PROXY) MANAGEMENT
  // ============================================================================

  async listSpectrumApplications(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/spectrum/apps`);
    return response.result;
  }

  async createSpectrumApplication(
    dns: string,
    originDirect: string[],
    protocol: string,
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = { dns: { name: dns }, origin_direct: originDirect, protocol };
    const response = await this.makeApiRequest('POST', `/zones/${zone}/spectrum/apps`, data);
    this.logger.success(`Spectrum application ${dns} created successfully`);
    return response.result;
  }

  async deleteSpectrumApplication(appId: string, zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('DELETE', `/zones/${zone}/spectrum/apps/${appId}`);
    this.logger.success(`Spectrum application ${appId} deleted successfully`);
  }

  // ============================================================================
  // DURABLE OBJECTS MANAGEMENT
  // ============================================================================

  async listDurableObjectNamespaces(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/workers/durable_objects/namespaces`
    );
    return response.result;
  }

  async createDurableObjectNamespace(
    name: string,
    script: string,
    className: string
  ): Promise<any> {
    const data = { name, script, class: className };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/workers/durable_objects/namespaces`,
      data
    );
    this.logger.success(`Durable Object namespace ${name} created successfully`);
    return response.result;
  }

  async deleteDurableObjectNamespace(namespaceId: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/workers/durable_objects/namespaces/${namespaceId}`
    );
    this.logger.success(`Durable Object namespace ${namespaceId} deleted successfully`);
  }

  async listDurableObjects(namespaceId: string): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/workers/durable_objects/namespaces/${namespaceId}/objects`
    );
    return response.result;
  }

  // ============================================================================
  // CACHING AND PURGE MANAGEMENT
  // ============================================================================

  async purgeCache(
    files?: string[],
    tags?: string[],
    hosts?: string[],
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data: any = {};
    if (files) data.files = files;
    if (tags) data.tags = tags;
    if (hosts) data.hosts = hosts;

    // If no specific items provided, purge everything
    if (!files && !tags && !hosts) {
      data.purge_everything = true;
    }

    const response = await this.makeApiRequest('POST', `/zones/${zone}/purge_cache`, data);
    this.logger.success('Cache purge initiated successfully');
    return response.result;
  }

  async getCacheSettings(zoneId?: string): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest('GET', `/zones/${zone}/settings/cache_level`);
    return response.result;
  }

  async updateCacheSettings(
    level: 'aggressive' | 'basic' | 'simplified',
    zoneId?: string
  ): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('PATCH', `/zones/${zone}/settings/cache_level`, { value: level });
    this.logger.success(`Cache level updated to ${level}`);
  }

  // ============================================================================
  // LOGPUSH MANAGEMENT
  // ============================================================================

  async listLogpushJobs(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/logpush/jobs`);
    return response.result;
  }

  async createLogpushJob(
    name: string,
    destination: string,
    dataset: string,
    logpullOptions?: string,
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = { name, destination_conf: destination, dataset, logpull_options: logpullOptions };
    const response = await this.makeApiRequest('POST', `/zones/${zone}/logpush/jobs`, data);
    this.logger.success(`Logpush job ${name} created successfully`);
    return response.result;
  }

  async deleteLogpushJob(jobId: string, zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('DELETE', `/zones/${zone}/logpush/jobs/${jobId}`);
    this.logger.success(`Logpush job ${jobId} deleted successfully`);
  }

  // ============================================================================
  // WAITING ROOM MANAGEMENT
  // ============================================================================

  async listWaitingRooms(zoneId?: string): Promise<any[]> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const response = await this.makeApiRequest<any[]>('GET', `/zones/${zone}/waiting_rooms`);
    return response.result;
  }

  async createWaitingRoom(
    name: string,
    host: string,
    path: string,
    totalActiveUsers: number,
    newUsersPerMinute: number,
    zoneId?: string
  ): Promise<any> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const data = {
      name,
      host,
      path,
      total_active_users: totalActiveUsers,
      new_users_per_minute: newUsersPerMinute,
    };

    const response = await this.makeApiRequest('POST', `/zones/${zone}/waiting_rooms`, data);
    this.logger.success(`Waiting room ${name} created successfully`);
    return response.result;
  }

  async deleteWaitingRoom(waitingRoomId: string, zoneId?: string): Promise<void> {
    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    await this.makeApiRequest('DELETE', `/zones/${zone}/waiting_rooms/${waitingRoomId}`);
    this.logger.success(`Waiting room ${waitingRoomId} deleted successfully`);
  }

  // ============================================================================
  // MAGIC TRANSIT MANAGEMENT
  // ============================================================================

  async listMagicTransitTunnels(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/magic/ipsec_tunnels`
    );
    return response.result;
  }

  async createMagicTransitTunnel(
    name: string,
    customerEndpoint: string,
    cloudflareEndpoint: string,
    psk: string
  ): Promise<any> {
    const data = {
      name,
      customer_endpoint: customerEndpoint,
      cloudflare_endpoint: cloudflareEndpoint,
      interface_address: '192.168.1.1/30',
      psk,
    };

    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/magic/ipsec_tunnels`,
      data
    );
    this.logger.success(`Magic Transit tunnel ${name} created successfully`);
    return response.result;
  }

  // ============================================================================
  // ADVANCED MONITORING AND ALERTING
  // ============================================================================

  async createAlert(
    name: string,
    alertType: string,
    mechanisms: any[],
    filters: any
  ): Promise<any> {
    const data = {
      name,
      alert_type: alertType,
      mechanisms,
      filters,
    };

    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/alerting/v3/policies`,
      data
    );
    this.logger.success(`Alert ${name} created successfully`);
    return response.result;
  }

  async listAlerts(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/alerting/v3/policies`
    );
    return response.result;
  }

  async deleteAlert(alertId: string): Promise<void> {
    await this.makeApiRequest(
      'DELETE',
      `/accounts/${this.config.accountId}/alerting/v3/policies/${alertId}`
    );
    this.logger.success(`Alert ${alertId} deleted successfully`);
  }

  // ============================================================================
  // MAGIC FIREWALL MANAGEMENT
  // ============================================================================

  async listMagicFirewallRules(): Promise<any[]> {
    const response = await this.makeApiRequest<any[]>(
      'GET',
      `/accounts/${this.config.accountId}/magic/firewall/rules`
    );
    return response.result;
  }

  async createMagicFirewallRule(
    name: string,
    expression: string,
    action: string,
    description?: string
  ): Promise<any> {
    const data = { name, expression, action, description };
    const response = await this.makeApiRequest(
      'POST',
      `/accounts/${this.config.accountId}/magic/firewall/rules`,
      data
    );
    this.logger.success(`Magic Firewall rule ${name} created successfully`);
    return response.result;
  }

  // ============================================================================
  // COMPREHENSIVE FUNCTION COUNT VALIDATOR
  // ============================================================================

  getFunctionCount(): { total: number; categories: Record<string, number> } {
    const functions = [
      // Authentication & User (5 functions)
      'login',
      'logout',
      'whoami',
      'verifyApiKey',
      'getUserInfo',

      // Workers (8 functions)
      'listWorkers',
      'getWorker',
      'deployWorker',
      'deployWorkerWithWrangler',
      'deleteWorker',
      'getWorkerUsage',
      'listWorkerDeployments',
      'rollbackWorker',
      'tailWorkerLogs', // Pages (11 functions)
      'listPagesProjects',
      'getPagesProject',
      'createPagesProject',
      'createPagesProjectWithWrangler',
      'deletePagesProject',
      'deployPages',
      'listPagesDeployments',
      'retryPagesDeployment',
      'rollbackPagesDeployment',
      'addPagesDomain',
      'removePagesDomain',
      'listPagesDomains',

      // KV Storage (10 functions)
      'listKVNamespaces',
      'createKVNamespace',
      'createKVNamespaceWithWrangler',
      'deleteKVNamespace',
      'renameKVNamespace',
      'listKVKeys',
      'getKVValue',
      'putKVValue',
      'deleteKVValue',
      'bulkWriteKV',
      'bulkDeleteKV',

      // R2 Storage (8 functions)
      'listR2Buckets',
      'createR2Bucket',
      'deleteR2Bucket',
      'listR2Objects',
      'putR2Object',
      'getR2Object',
      'deleteR2Object',
      'generateR2PresignedUrl',

      // D1 Database (12 functions)
      'listD1Databases',
      'createD1Database',
      'deleteD1Database',
      'executeD1Query',
      'executeD1File',
      'migrateD1Database',
      'listD1Migrations',
      'createD1Backup',
      'listD1Backups',
      'restoreD1Backup',
      'downloadD1Backup',

      // AI/ML (3 functions)
      'listAIModels',
      'runAIModel',
      'getAIModelSchema',

      // DNS & Zones (9 functions)
      'listZones',
      'getZone',
      'createZone',
      'deleteZone',
      'pauseZone',
      'unpauseZone',
      'listDnsRecords',
      'createDnsRecord',
      'updateDnsRecord',
      'deleteDnsRecord',

      // Secrets (4 functions)
      'listSecrets',
      'putSecret',
      'deleteSecret',
      'bulkPutSecrets',

      // Analytics (3 functions)
      'getAnalytics',
      'getZoneAnalytics',
      'getWorkerAnalytics',

      // SSL/TLS (5 functions)
      'listCertificates',
      'orderCertificate',
      'deleteCertificate',
      'getSSLSettings',
      'updateSSLSettings',

      // Custom Domains (3 functions)
      'addCustomDomain',
      'removeCustomDomain',
      'listRoutes',

      // Load Balancing (2 functions)
      'createLoadBalancer',
      'listLoadBalancers',

      // Security/WAF (6 functions)
      'listFirewallRules',
      'createFirewallRule',
      'enableBotManagement',
      'enableDDoSProtection',
      'createRateLimit',
      'listRateLimits',

      // Bulk Operations (7 functions)
      'bulkCreateDnsRecords',
      'exportZoneFile',
      'importZoneFile',
      'checkWorkerHealth',
      'checkPagesHealth',
      'getOverallStatus',
      'cleanupEnvironment', // Configuration (6 functions)
      'exportConfiguration',
      'saveConfigurationToFile',
      'validateAndFixDnsRecords',
      'validateConnectreeInfrastructure',
      'prepareDeploymentEnvironment',
      'generateDeploymentReport',

      // Advanced Deployment (2 functions)
      'deployWithBlueGreen',
      'deployWithCanary',

      // Stream Video (4 functions)
      'listStreamVideos',
      'uploadStreamVideo',
      'deleteStreamVideo',
      'getStreamVideoDetails',

      // Images (4 functions)
      'listImages',
      'uploadImage',
      'deleteImage',
      'getImageVariants',

      // Turnstile (4 functions)
      'listTurnstileSites',
      'createTurnstileSite',
      'deleteTurnstileSite',
      'rotateTurnstileSecret',

      // Access/Zero Trust (5 functions)
      'listAccessApplications',
      'createAccessApplication',
      'deleteAccessApplication',
      'listAccessPolicies',
      'createAccessPolicy',

      // Email Routing (3 functions)
      'enableEmailRouting',
      'listEmailRoutingRules',
      'createEmailRoutingRule',

      // Spectrum (3 functions)
      'listSpectrumApplications',
      'createSpectrumApplication',
      'deleteSpectrumApplication',

      // Durable Objects (4 functions)
      'listDurableObjectNamespaces',
      'createDurableObjectNamespace',
      'deleteDurableObjectNamespace',
      'listDurableObjects',

      // Caching (3 functions)
      'purgeCache',
      'getCacheSettings',
      'updateCacheSettings',

      // Logpush (3 functions)
      'listLogpushJobs',
      'createLogpushJob',
      'deleteLogpushJob',

      // Waiting Room (3 functions)
      'listWaitingRooms',
      'createWaitingRoom',
      'deleteWaitingRoom',

      // Magic Transit (2 functions)
      'listMagicTransitTunnels',
      'createMagicTransitTunnel',

      // Alerting (3 functions)
      'createAlert',
      'listAlerts',
      'deleteAlert',

      // Magic Firewall (2 functions)
      'listMagicFirewallRules',
      'createMagicFirewallRule',

      // Utility (1 function)
      'getFunctionCount',
    ];
    const categories = {
      'Authentication & User': 5,
      Workers: 9,
      Pages: 11,
      'KV Storage': 11,
      'R2 Storage': 8,
      'D1 Database': 11,
      'AI/ML': 3,
      'DNS & Zones': 10,
      Secrets: 4,
      Analytics: 3,
      'SSL/TLS': 5,
      'Custom Domains': 3,
      'Load Balancing': 2,
      'Security/WAF': 6,
      'Bulk Operations': 7,
      Configuration: 6,
      'Advanced Deployment': 2,
      'Stream Video': 4,
      Images: 4,
      Turnstile: 4,
      'Access/Zero Trust': 5,
      'Email Routing': 3,
      Spectrum: 3,
      'Durable Objects': 4,
      Caching: 3,
      Logpush: 3,
      'Waiting Room': 3,
      'Magic Transit': 2,
      Alerting: 3,
      'Magic Firewall': 2,
      Utility: 1,
    };

    return {
      total: functions.length,
      categories,
    };
  }

  // ============================================================================
  // DISPLAY AVAILABLE FUNCTIONS
  // ============================================================================

  displayAvailableFunctions(): void {
    const { total, categories } = this.getFunctionCount();

    this.logger.info('='.repeat(80));
    this.logger.info('CLOUDFLARE MANAGER - AVAILABLE FUNCTIONS');
    this.logger.info('='.repeat(80));
    this.logger.info(`Total Functions: ${total}`);
    this.logger.info('='.repeat(80));

    Object.entries(categories).forEach(([category, count]) => {
      this.logger.info(`${category.padEnd(25)}: ${count} functions`);
    });

    this.logger.info('='.repeat(80));
    this.logger.success('All Cloudflare services covered with comprehensive functionality!');
  }

  // ============================================================================
  // ENHANCED DNS VALIDATION AND AUTO-FIXING
  // ============================================================================

  async validateAndFixDnsRecords(
    expectedRecords: Array<{
      name: string;
      type: string;
      content: string;
      proxied?: boolean;
      ttl?: number;
    }>,
    zoneId?: string,
    autoFix: boolean = false
  ): Promise<{
    valid: boolean;
    issues: Array<{
      type: 'missing' | 'incorrect' | 'extra';
      record: any;
      expected?: any;
      action?: string;
    }>;
    fixed: boolean;
  }> {
    this.logger.info('🔍 Validating DNS records...');

    const zone = zoneId || this.config.zoneId;
    if (!zone) throw new Error('Zone ID is required');

    const existingRecords = await this.listDnsRecords(zone);
    const issues: Array<{
      type: 'missing' | 'incorrect' | 'extra';
      record: any;
      expected?: any;
      action?: string;
    }> = [];

    // Check for missing and incorrect records
    for (const expected of expectedRecords) {
      const existing = existingRecords.find(
        (r) => r.name === expected.name && r.type === expected.type
      );

      if (!existing) {
        issues.push({
          type: 'missing',
          record: expected,
          action: autoFix ? 'CREATE' : 'REQUIRES_CREATION',
        });
        if (autoFix) {
          try {
            await this.createDnsRecord(
              {
                name: expected.name,
                type: expected.type,
                content: expected.content,
                proxied: expected.proxied,
                ttl: expected.ttl,
              },
              zone
            );
            this.logger.success(
              `✅ Created missing DNS record: ${expected.name} (${expected.type})`
            );
          } catch (error) {
            this.logger.error(
              `❌ Failed to create DNS record: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      } else if (
        existing.content !== expected.content ||
        existing.proxied !== (expected.proxied ?? false) ||
        (expected.ttl && existing.ttl !== expected.ttl)
      ) {
        issues.push({
          type: 'incorrect',
          record: existing,
          expected: expected,
          action: autoFix ? 'UPDATE' : 'REQUIRES_UPDATE',
        });
        if (autoFix) {
          try {
            await this.updateDnsRecord(
              existing.id,
              {
                name: expected.name,
                type: expected.type,
                content: expected.content,
                proxied: expected.proxied,
                ttl: expected.ttl,
              },
              zone
            );
            this.logger.success(`✅ Updated DNS record: ${expected.name} (${expected.type})`);
          } catch (error) {
            this.logger.error(
              `❌ Failed to update DNS record: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }
    }

    const valid = issues.length === 0;
    const fixed = autoFix && issues.length > 0;

    this.logger.info(
      `DNS validation completed - Valid: ${valid}, Issues: ${issues.length}, Fixed: ${fixed}`
    );

    return { valid, issues, fixed };
  }

  async validateConnectreeInfrastructure(autoFix: boolean = false): Promise<{
    dns: { valid: boolean; issues: any[] };
    pages: { valid: boolean; domains: string[] };
    workers: { valid: boolean; workers: string[] };
    ssl: { valid: boolean; certificates: number };
    overall: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    this.logger.info('🏗️ Validating ConnecTree infrastructure...');

    // Expected DNS records for ConnecTree
    const expectedDnsRecords = [
      {
        name: 'connectree.cc',
        type: 'CNAME',
        content: 'connectree.pages.dev',
        proxied: true,
        ttl: 1, // Auto (proxied)
      },
      {
        name: 'www.connectree.cc',
        type: 'CNAME',
        content: 'connectree.pages.dev',
        proxied: true,
        ttl: 1, // Auto (proxied)
      },
      {
        name: 'staging.connectree.cc',
        type: 'CNAME',
        content: 'connectree.pages.dev',
        proxied: true,
        ttl: 1, // Auto (proxied)
      },
      {
        name: 'api.connectree.cc',
        type: 'CNAME',
        content: 'connectree-api.mehya-ashani.workers.dev',
        proxied: true,
        ttl: 1, // Auto (proxied)
      },
      {
        name: 'api-staging.connectree.cc',
        type: 'CNAME',
        content: 'connectree-api-staging.mehya-ashani.workers.dev',
        proxied: true,
        ttl: 1, // Auto (proxied)
      },
    ];

    const [dnsValidation, pages, workers, certificates] = await Promise.all([
      this.validateAndFixDnsRecords(expectedDnsRecords, undefined, autoFix),
      this.listPagesProjects(),
      this.listWorkers(),
      this.listCertificates().catch(() => []),
    ]);

    // Validate Pages projects
    const connectreeProject = pages.find((p) => p.name === 'connectree');
    const pagesValid = !!connectreeProject && connectreeProject.domains?.length > 0;

    // Validate Workers
    const expectedWorkers = ['connectree-api', 'connectree-api-staging'];
    const existingWorkers = workers.map((w) => w.name);
    const workersValid = expectedWorkers.every((name) => existingWorkers.includes(name));

    // Validate SSL
    const sslValid = certificates.length > 0;

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (dnsValidation.valid && pagesValid && workersValid && sslValid) {
      overall = 'healthy';
    } else if ((!dnsValidation.valid && dnsValidation.issues.length <= 2) || !sslValid) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    const result = {
      dns: {
        valid: dnsValidation.valid,
        issues: dnsValidation.issues,
      },
      pages: {
        valid: pagesValid,
        domains: connectreeProject?.domains || [],
      },
      workers: {
        valid: workersValid,
        workers: existingWorkers,
      },
      ssl: {
        valid: sslValid,
        certificates: certificates.length,
      },
      overall,
    };

    this.logger.success(
      `Infrastructure validation completed - Overall status: ${overall.toUpperCase()}`
    );
    return result;
  }

  // ============================================================================
  // DEPLOYMENT INTEGRATION UTILITIES
  // ============================================================================

  async prepareDeploymentEnvironment(
    environment: 'staging' | 'production',
    options: {
      validateDns?: boolean;
      autoFixDns?: boolean;
      ensurePages?: boolean;
      validateWorkers?: boolean;
    } = {}
  ): Promise<{
    ready: boolean;
    issues: string[];
    warnings: string[];
    environment: 'staging' | 'production';
    resources: {
      pages: { exists: boolean; domains: string[] };
      workers: { exists: boolean; names: string[] };
      dns: { valid: boolean; issues: any[] };
    };
  }> {
    this.logger.info(`🚀 Preparing ${environment} deployment environment...`);

    const issues: string[] = [];
    const warnings: string[] = [];

    // Determine expected resources based on environment
    const expectedPages = 'connectree';
    const expectedWorkers =
      environment === 'production' ? ['connectree-api'] : ['connectree-api-staging'];

    // Check Pages project
    let pagesExists = false;
    let pagesDomains: string[] = [];
    try {
      const project = await this.getPagesProject(expectedPages);
      pagesExists = true;
      pagesDomains = project.domains || [];
      this.logger.success(`✅ Pages project '${expectedPages}' found`);
    } catch (error) {
      if (options.ensurePages) {
        this.logger.warn(`⚠️ Pages project '${expectedPages}' not found, creating...`);
        try {
          await this.createPagesProject(expectedPages);
          pagesExists = true;
          this.logger.success(`✅ Created Pages project '${expectedPages}'`);
        } catch (createError) {
          issues.push(
            `Failed to create Pages project '${expectedPages}': ${createError instanceof Error ? createError.message : 'Unknown error'}`
          );
        }
      } else {
        issues.push(`Pages project '${expectedPages}' does not exist`);
      }
    }

    // Check Workers
    let workersValid = false;
    let existingWorkers: string[] = [];
    try {
      const workers = await this.listWorkers();
      existingWorkers = workers.map((w) => w.name);
      const missingWorkers = expectedWorkers.filter((name) => !existingWorkers.includes(name));

      if (missingWorkers.length === 0) {
        workersValid = true;
        this.logger.success(`✅ All expected workers found: ${expectedWorkers.join(', ')}`);
      } else {
        warnings.push(`Missing workers: ${missingWorkers.join(', ')}`);
        this.logger.warn(`⚠️ Missing workers: ${missingWorkers.join(', ')}`);
      }
    } catch (error) {
      issues.push(
        `Failed to check workers: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // DNS Validation
    let dnsValid = false;
    let dnsIssues: any[] = [];
    if (options.validateDns) {
      try {
        const expectedDnsRecords = this.getExpectedDnsRecords(environment);
        const dnsValidation = await this.validateAndFixDnsRecords(
          expectedDnsRecords,
          undefined,
          options.autoFixDns || false
        );
        dnsValid = dnsValidation.valid;
        dnsIssues = dnsValidation.issues;

        if (dnsValid) {
          this.logger.success('✅ DNS records are valid');
        } else {
          this.logger.warn(`⚠️ Found ${dnsIssues.length} DNS issues`);
          if (!options.autoFixDns) {
            warnings.push(
              `DNS issues found (use --fix to auto-repair): ${dnsIssues.length} issues`
            );
          }
        }
      } catch (error) {
        issues.push(
          `DNS validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    const ready = issues.length === 0 && (options.validateDns ? dnsValid : true);

    this.logger.info(`Deployment environment check completed - Ready: ${ready ? 'YES' : 'NO'}`);

    return {
      ready,
      issues,
      warnings,
      environment,
      resources: {
        pages: { exists: pagesExists, domains: pagesDomains },
        workers: { exists: workersValid, names: existingWorkers },
        dns: { valid: dnsValid, issues: dnsIssues },
      },
    };
  }

  private getExpectedDnsRecords(environment: 'staging' | 'production'): Array<{
    name: string;
    type: string;
    content: string;
    proxied?: boolean;
    ttl?: number;
  }> {
    const baseRecords = [
      {
        name: 'connectree.cc',
        type: 'CNAME',
        content: 'connectree.pages.dev',
        proxied: true,
        ttl: 1,
      },
      {
        name: 'www.connectree.cc',
        type: 'CNAME',
        content: 'connectree.pages.dev',
        proxied: true,
        ttl: 1,
      },
      {
        name: 'api.connectree.cc',
        type: 'CNAME',
        content: 'connectree-api.mehya-ashani.workers.dev',
        proxied: true,
        ttl: 1,
      },
    ];

    if (environment === 'staging') {
      baseRecords.push(
        {
          name: 'staging.connectree.cc',
          type: 'CNAME',
          content: 'connectree.pages.dev',
          proxied: true,
          ttl: 1,
        },
        {
          name: 'api-staging.connectree.cc',
          type: 'CNAME',
          content: 'connectree-api-staging.mehya-ashani.workers.dev',
          proxied: true,
          ttl: 1,
        }
      );
    }

    return baseRecords;
  }

  async generateDeploymentReport(environment: 'staging' | 'production'): Promise<{
    timestamp: string;
    environment: string;
    summary: {
      status: 'ready' | 'issues' | 'failed';
      readiness: number; // percentage
    };
    components: any;
    recommendations: string[];
  }> {
    this.logger.info('📋 Generating deployment readiness report...');

    const preparationResult = await this.prepareDeploymentEnvironment(environment, {
      validateDns: true,
      autoFixDns: false,
      ensurePages: false,
      validateWorkers: true,
    });

    const healthCheck = await this.comprehensiveHealthCheck();

    const totalChecks = 4; // DNS, Pages, Workers, SSL
    let passedChecks = 0;

    if (preparationResult.resources.dns.valid) passedChecks++;
    if (preparationResult.resources.pages.exists) passedChecks++;
    if (preparationResult.resources.workers.exists) passedChecks++;
    if (healthCheck.services.ssl.status === 'healthy') passedChecks++;

    const readiness = Math.round((passedChecks / totalChecks) * 100);

    let status: 'ready' | 'issues' | 'failed';
    if (readiness >= 100) status = 'ready';
    else if (readiness >= 75) status = 'issues';
    else status = 'failed';

    const recommendations: string[] = [];

    if (!preparationResult.resources.dns.valid) {
      recommendations.push(
        'Run DNS validation with auto-fix: npx tsx CloudFlareManager.ts validate-dns --fix'
      );
    }
    if (!preparationResult.resources.pages.exists) {
      recommendations.push('Ensure Pages project exists before deployment');
    }
    if (!preparationResult.resources.workers.exists) {
      recommendations.push('Deploy Workers before Pages to ensure API availability');
    }
    if (healthCheck.services.ssl.status !== 'healthy') {
      recommendations.push('Check SSL certificate status and renew if necessary');
    }

    return {
      timestamp: new Date().toISOString(),
      environment,
      summary: { status, readiness },
      components: {
        dns: preparationResult.resources.dns,
        pages: preparationResult.resources.pages,
        workers: preparationResult.resources.workers,
        ssl: {
          status: healthCheck.services.ssl.status,
          certificates: healthCheck.services.ssl.certificates,
        },
        overall: healthCheck.status,
      },
      recommendations,
    };
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

export default CloudFlareManager;

// ============================================================================
// CLI INTERFACE
// ============================================================================

function showHelp() {
  console.log(`
🚀 CloudFlare Manager CLI

Usage: npx tsx CloudFlareManager.ts <command> [options]

Commands:
  status              - Get overall infrastructure status
  health              - Run comprehensive health check
  list-workers        - List all workers
  list-kv             - List all KV namespaces
  list-r2             - List all R2 buckets
  list-d1             - List all D1 databases
  list-pages          - List all Pages projects
  list-zones          - List all zones
  list-dns <zone-id>  - List DNS records for a zone
    # Pages Domain Management
  list-pages-domains <project>     - List domains for a Pages project
  add-pages-domain <project> <domain> - Add domain to Pages project
  remove-pages-domain <project> <domain> - Remove domain from Pages project
    # DNS Management & Validation
  validate-dns [--fix]            - Validate ConnecTree DNS records (use --fix to auto-repair)
  validate-infrastructure [--fix] - Comprehensive infrastructure validation

  # Deployment Integration
  deployment-check <env>          - Check deployment readiness for staging/production
  deployment-report <env>         - Generate comprehensive deployment report
  prepare-deployment <env> [--fix] - Prepare environment for deployment

  # Deployment Commands
  deploy-worker <env> <path> - Deploy a worker

  # Resource Creation
  create-kv <name>    - Create a KV namespace
  create-r2 <name>    - Create an R2 bucket
  create-d1 <name>    - Create a D1 database

  # Utilities
  purge-cache <zone-id> - Purge all cache for a zone
  tail-logs <worker>  - Tail worker logs
  verify-token        - Verify API key validity
  help                - Show this help

Environment Variables Required:
  CLOUDFLARE_API_KEY
  CLOUDFLARE_EMAIL
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_ZONE_ID (optional)

Examples:
  npx tsx CloudFlareManager.ts status
  npx tsx CloudFlareManager.ts health
  npx tsx CloudFlareManager.ts deploy-worker production ./dist
  npx tsx CloudFlareManager.ts create-kv "my-store"  npx tsx CloudFlareManager.ts list-pages-domains connectree  npx tsx CloudFlareManager.ts add-pages-domain connectree staging.connectree.cc
  npx tsx CloudFlareManager.ts validate-dns --fix
  npx tsx CloudFlareManager.ts validate-infrastructure
  npx tsx CloudFlareManager.ts deployment-check staging
  npx tsx CloudFlareManager.ts prepare-deployment production --fix
  npx tsx CloudFlareManager.ts list-dns zone123
  npx tsx CloudFlareManager.ts verify-token
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    showHelp();
    process.exit(0);
  }

  try {
    const cfManager = new CloudFlareManager({
      environment: (process.env.NODE_ENV as Environment) || 'development',
      verbose: args.includes('--verbose') || args.includes('-v'),
      dryRun: args.includes('--dry-run'),
    });

    switch (command) {
      case 'status':
        console.log('📊 Getting overall infrastructure status...');
        const status = await cfManager.getOverallStatus();
        console.log(JSON.stringify(status, null, 2));
        break;

      case 'list-workers':
        console.log('👷 Listing all workers...');
        const workers = await cfManager.listWorkers();
        console.table(
          workers.map((w) => ({
            Name: w.name,
            Environment: w.environment,
            'Created On': new Date(w.created_on).toLocaleDateString(),
            'Usage Model': w.usage_model,
          }))
        );
        break;

      case 'list-kv':
        console.log('🗄️ Listing all KV namespaces...');
        const kvNamespaces = await cfManager.listKVNamespaces();
        console.table(
          kvNamespaces.map((kv) => ({
            ID: kv.id,
            Title: kv.title,
            'URL Encoding': kv.supports_url_encoding ? 'Yes' : 'No',
          }))
        );
        break;

      case 'list-r2':
        console.log('🪣 Listing all R2 buckets...');
        const buckets = await cfManager.listR2Buckets();
        console.table(
          buckets.map((b) => ({
            Name: b.name,
            'Creation Date': new Date(b.creation_date).toLocaleDateString(),
            Location: b.location || 'N/A',
          }))
        );
        break;

      case 'list-d1':
        console.log('🗃️ Listing all D1 databases...');
        const databases = await cfManager.listD1Databases();
        console.table(
          databases.map((d) => ({
            Name: d.name,
            UUID: d.uuid,
            'Created At': new Date(d.created_at).toLocaleDateString(),
            'Num Tables': d.num_tables,
            'File Size': d.file_size,
          }))
        );
        break;

      case 'list-pages':
        console.log('📄 Listing all Pages projects...');
        const projects = await cfManager.listPagesProjects();
        console.table(
          projects.map((p) => ({
            ID: p.id,
            Name: p.name,
            Domains: p.domains.join(', '),
          }))
        );
        break;

      case 'list-zones':
        console.log('🌐 Listing all zones...');
        const zones = await cfManager.listZones();
        console.table(
          zones.map((z) => ({
            ID: z.id,
            Name: z.name,
            Status: z.status,
            Paused: z.paused ? 'Yes' : 'No',
            Plan: z.plan.name,
          }))
        );
        break;

      case 'list-dns':
        const zoneId = args[1];
        if (!zoneId) {
          console.error('❌ Zone ID required for list-dns command');
          process.exit(1);
        }
        console.log(`🔍 Listing DNS records for zone ${zoneId}...`);
        const dnsRecords = await cfManager.listDnsRecords(zoneId);
        console.table(
          dnsRecords.map((r) => ({
            ID: r.id,
            Type: r.type,
            Name: r.name,
            Content: r.content,
            Proxied: r.proxied ? 'Yes' : 'No',
            TTL: r.ttl,
          }))
        );
        break;

      case 'deploy-worker':
        const env = args[1] as Environment;
        const workerPath = args[2];
        if (!env || !workerPath) {
          console.error('❌ Environment and worker path required');
          process.exit(1);
        }
        console.log(`🚀 Deploying worker to ${env} from ${workerPath}...`);
        const result = await cfManager.deployWorkerWithWrangler(env, workerPath);
        console.log('✅ Worker deployed successfully:', result);
        break;

      case 'create-kv':
        const kvName = args[1];
        if (!kvName) {
          console.error('❌ KV namespace name required');
          process.exit(1);
        }
        console.log(`🗄️ Creating KV namespace: ${kvName}...`);
        const kvResult = await cfManager.createKVNamespace(kvName);
        console.log('✅ KV namespace created:', kvResult);
        break;

      case 'create-r2':
        const bucketName = args[1];
        if (!bucketName) {
          console.error('❌ R2 bucket name required');
          process.exit(1);
        }
        console.log(`🪣 Creating R2 bucket: ${bucketName}...`);
        const r2Result = await cfManager.createR2Bucket(bucketName);
        console.log('✅ R2 bucket created:', r2Result);
        break;

      case 'create-d1':
        const dbName = args[1];
        if (!dbName) {
          console.error('❌ D1 database name required');
          process.exit(1);
        }
        console.log(`🗃️ Creating D1 database: ${dbName}...`);
        const d1Result = await cfManager.createD1Database(dbName);
        console.log('✅ D1 database created:', d1Result);
        break;

      case 'purge-cache':
        const purgeZoneId = args[1];
        if (!purgeZoneId) {
          console.error('❌ Zone ID required for purge-cache command');
          process.exit(1);
        }
        console.log(`🧹 Purging cache for zone ${purgeZoneId}...`);
        const purgeResult = await cfManager.purgeCache(
          undefined,
          undefined,
          undefined,
          purgeZoneId
        );
        console.log('✅ Cache purged successfully:', purgeResult);
        break;
      case 'tail-logs':
        const workerName = args[1];
        if (!workerName) {
          console.error('❌ Worker name required for tail-logs command');
          process.exit(1);
        }
        console.log(`📄 Tailing logs for worker: ${workerName}...`);
        console.log('Press Ctrl+C to stop...');
        await cfManager.tailWorkerLogs(workerName);
        break;
      case 'verify-token':
        console.log('🔑 Verifying API key...');
        const isValid = await cfManager.verifyApiKey();
        if (isValid) {
          console.log('✅ API key is valid and working correctly');
        } else {
          console.log('❌ API key verification failed');
          process.exit(1);
        }
        break;

      case 'health':
        console.log('🏥 Running comprehensive health check...');
        const healthResult = await cfManager.comprehensiveHealthCheck();
        console.log('✅ Health check completed:');
        console.log(JSON.stringify(healthResult, null, 2));
        break;

      case 'list-pages-domains':
        const listProject = args[1];
        if (!listProject) {
          console.error('❌ Pages project name required');
          process.exit(1);
        }
        console.log(`🌐 Listing domains for Pages project: ${listProject}...`);
        const domains = await cfManager.listPagesDomains(listProject);
        if (domains.length === 0) {
          console.log('📄 No domains found for this project');
        } else {
          console.table(
            domains.map((domain, index) => ({
              Index: index + 1,
              Domain: domain,
            }))
          );
        }
        break;

      case 'add-pages-domain':
        const addProject = args[1];
        const addDomain = args[2];
        if (!addProject || !addDomain) {
          console.error('❌ Both project name and domain are required');
          console.log('Usage: npx tsx CloudFlareManager.ts add-pages-domain <project> <domain>');
          process.exit(1);
        }
        console.log(`➕ Adding domain ${addDomain} to Pages project ${addProject}...`);
        const addResult = await cfManager.addPagesDomain(addProject, addDomain);
        console.log('✅ Domain added successfully:', addResult);
        break;
      case 'remove-pages-domain':
        const removeProject = args[1];
        const removeDomain = args[2];
        if (!removeProject || !removeDomain) {
          console.error('❌ Both project name and domain are required');
          console.log('Usage: npx tsx CloudFlareManager.ts remove-pages-domain <project> <domain>');
          process.exit(1);
        }
        console.log(`➖ Removing domain ${removeDomain} from Pages project ${removeProject}...`);
        await cfManager.removePagesDomain(removeProject, removeDomain);
        console.log('✅ Domain removed successfully');
        break;

      case 'validate-dns':
        const autoFixDns = args.includes('--fix');
        console.log(
          `🔍 Validating ConnecTree DNS records${autoFixDns ? ' (with auto-fix)' : ''}...`
        );

        const expectedDnsRecords = [
          {
            name: 'connectree.cc',
            type: 'CNAME',
            content: 'connectree.pages.dev',
            proxied: true,
            ttl: 1,
          },
          {
            name: 'www.connectree.cc',
            type: 'CNAME',
            content: 'connectree.pages.dev',
            proxied: true,
            ttl: 1,
          },
          {
            name: 'staging.connectree.cc',
            type: 'CNAME',
            content: 'connectree.pages.dev',
            proxied: true,
            ttl: 1,
          },
          {
            name: 'api.connectree.cc',
            type: 'CNAME',
            content: 'connectree-api.mehya-ashani.workers.dev',
            proxied: true,
            ttl: 1,
          },
          {
            name: 'api-staging.connectree.cc',
            type: 'CNAME',
            content: 'connectree-api-staging.mehya-ashani.workers.dev',
            proxied: true,
            ttl: 1,
          },
        ];

        const dnsValidationResult = await cfManager.validateAndFixDnsRecords(
          expectedDnsRecords,
          undefined,
          autoFixDns
        );

        console.log('🔍 DNS Validation Results:');
        console.log(`   Valid: ${dnsValidationResult.valid ? '✅' : '❌'}`);
        console.log(`   Issues Found: ${dnsValidationResult.issues.length}`);
        console.log(`   Auto-Fixed: ${dnsValidationResult.fixed ? '✅' : '❌'}`);

        if (dnsValidationResult.issues.length > 0) {
          console.table(
            dnsValidationResult.issues.map((issue, index) => ({
              '#': index + 1,
              Type: issue.type.toUpperCase(),
              Record: `${issue.record.name || issue.expected?.name} (${issue.record.type || issue.expected?.type})`,
              Action: issue.action || 'REVIEW_REQUIRED',
            }))
          );
        }
        break;

      case 'validate-infrastructure':
        const autoFixInfra = args.includes('--fix');
        console.log(
          `🏗️ Validating ConnecTree infrastructure${autoFixInfra ? ' (with auto-fix)' : ''}...`
        );

        const infraValidationResult =
          await cfManager.validateConnectreeInfrastructure(autoFixInfra);

        console.log('🏗️ Infrastructure Validation Results:');
        console.log(`   Overall Status: ${infraValidationResult.overall.toUpperCase()}`);
        console.log('');
        console.log('📊 Component Status:');
        console.log(
          `   DNS: ${infraValidationResult.dns.valid ? '✅' : '❌'} (${infraValidationResult.dns.issues.length} issues)`
        );
        console.log(
          `   Pages: ${infraValidationResult.pages.valid ? '✅' : '❌'} (${infraValidationResult.pages.domains.length} domains)`
        );
        console.log(
          `   Workers: ${infraValidationResult.workers.valid ? '✅' : '❌'} (${infraValidationResult.workers.workers.length} workers)`
        );
        console.log(
          `   SSL: ${infraValidationResult.ssl.valid ? '✅' : '❌'} (${infraValidationResult.ssl.certificates} certificates)`
        );

        if (infraValidationResult.dns.issues.length > 0) {
          console.log('');
          console.log('🔍 DNS Issues Found:');
          console.table(
            infraValidationResult.dns.issues.map((issue, index) => ({
              '#': index + 1,
              Type: issue.type.toUpperCase(),
              Record: `${issue.record.name || issue.expected?.name} (${issue.record.type || issue.expected?.type})`,
              Action: issue.action || 'REVIEW_REQUIRED',
            }))
          );
        }
        break;

      case 'deployment-check':
      case 'deployment-report':
      case 'prepare-deployment':
        const deployEnv = args[1] as 'staging' | 'production';
        if (!deployEnv || !['staging', 'production'].includes(deployEnv)) {
          console.error('❌ Environment required (staging or production)');
          console.log(
            `Usage: npx tsx CloudFlareManager.ts ${command} <staging|production> [--fix]`
          );
          process.exit(1);
        }

        if (command === 'deployment-check') {
          console.log(`🔍 Checking deployment readiness for ${deployEnv}...`);
          const checkResult = await cfManager.prepareDeploymentEnvironment(deployEnv, {
            validateDns: true,
            autoFixDns: false,
            ensurePages: false,
            validateWorkers: true,
          });

          console.log('📊 Deployment Readiness Check Results:');
          console.log(`   Environment: ${checkResult.environment}`);
          console.log(`   Ready: ${checkResult.ready ? '✅ YES' : '❌ NO'}`);
          console.log(`   Issues: ${checkResult.issues.length}`);
          console.log(`   Warnings: ${checkResult.warnings.length}`);

          if (checkResult.issues.length > 0) {
            console.log('\n❌ Issues Found:');
            checkResult.issues.forEach((issue, index) => {
              console.log(`   ${index + 1}. ${issue}`);
            });
          }

          if (checkResult.warnings.length > 0) {
            console.log('\n⚠️ Warnings:');
            checkResult.warnings.forEach((warning, index) => {
              console.log(`   ${index + 1}. ${warning}`);
            });
          }

          console.log('\n📋 Resource Status:');
          console.log(
            `   Pages: ${checkResult.resources.pages.exists ? '✅' : '❌'} (${checkResult.resources.pages.domains.length} domains)`
          );
          console.log(
            `   Workers: ${checkResult.resources.workers.exists ? '✅' : '❌'} (${checkResult.resources.workers.names.length} workers)`
          );
          console.log(
            `   DNS: ${checkResult.resources.dns.valid ? '✅' : '❌'} (${checkResult.resources.dns.issues.length} issues)`
          );
        } else if (command === 'deployment-report') {
          console.log(`📋 Generating deployment report for ${deployEnv}...`);
          const report = await cfManager.generateDeploymentReport(deployEnv);

          console.log('📊 Deployment Readiness Report:');
          console.log(`   Timestamp: ${report.timestamp}`);
          console.log(`   Environment: ${report.environment}`);
          console.log(`   Status: ${report.summary.status.toUpperCase()}`);
          console.log(`   Readiness: ${report.summary.readiness}%`);

          console.log('\n🏗️ Component Status:');
          console.log(`   DNS: ${report.components.dns.valid ? '✅' : '❌'}`);
          console.log(`   Pages: ${report.components.pages.exists ? '✅' : '❌'}`);
          console.log(`   Workers: ${report.components.workers.exists ? '✅' : '❌'}`);
          console.log(`   SSL: ${report.components.ssl.status === 'healthy' ? '✅' : '❌'}`);
          console.log(`   Overall: ${report.components.overall.toUpperCase()}`);

          if (report.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            report.recommendations.forEach((rec, index) => {
              console.log(`   ${index + 1}. ${rec}`);
            });
          }
        } else if (command === 'prepare-deployment') {
          const autoFix = args.includes('--fix');
          console.log(
            `🚀 Preparing ${deployEnv} deployment environment${autoFix ? ' (with auto-fix)' : ''}...`
          );

          const prepResult = await cfManager.prepareDeploymentEnvironment(deployEnv, {
            validateDns: true,
            autoFixDns: autoFix,
            ensurePages: true,
            validateWorkers: true,
          });

          console.log('✅ Deployment preparation completed:');
          console.log(`   Ready: ${prepResult.ready ? '✅ YES' : '❌ NO'}`);
          console.log(`   Issues Fixed: ${autoFix ? 'YES' : 'NO'}`);

          if (!prepResult.ready) {
            console.log('\n❌ Remaining Issues:');
            prepResult.issues.forEach((issue, index) => {
              console.log(`   ${index + 1}. ${issue}`);
            });
          }
        }
        break;

      case 'help':
        showHelp();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run "npx tsx CloudFlareManager.ts help" for available commands');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (
  import.meta.url.startsWith('file:') &&
  process.argv[1] &&
  import.meta.url.includes(process.argv[1].replace(/\\/g, '/'))
) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

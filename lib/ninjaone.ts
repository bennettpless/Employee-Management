interface NinjaConfig {
  clientId: string
  clientSecret: string
  region: string
}

class NinjaOneClient {
  private config: NinjaConfig | null = null
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  private getConfig(): NinjaConfig {
    if (!this.config) {
      const clientId = process.env.NINJA_CLIENT_ID
      const clientSecret = process.env.NINJA_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        throw new Error('NINJA_CLIENT_ID and NINJA_CLIENT_SECRET must be set')
      }
      this.config = {
        clientId,
        clientSecret,
        region: process.env.NINJA_REGION || 'us'
      }
    }
    return this.config
  }

  private getBaseUrl(): string {
    const config = this.getConfig()
    const regionMap: { [key: string]: string } = {
      us: 'https://app.ninjarmm.com',
      eu: 'https://eu.ninjarmm.com',
      oc: 'https://oc.ninjarmm.com',
      ca: 'https://ca.ninjarmm.com'
    }
    return regionMap[config.region] || regionMap.us
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    const tokenUrl = `${this.getBaseUrl()}/ws/oauth/token`
    const config = this.getConfig()
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'monitoring management'
    })

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })

    if (!response.ok) {
      throw new Error(`Failed to get NinjaOne access token: ${response.statusText}`)
    }

    const data = await response.json()
    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000 // 1 min buffer
    
    return this.accessToken!
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const token = await this.getAccessToken()
    const url = `${this.getBaseUrl()}/v2${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      throw new Error(`NinjaOne API error: ${response.statusText}`)
    }

    return response.json()
  }

  async getDevices() {
    return this.makeRequest('/devices')
  }

  async getDevice(deviceId: string) {
    return this.makeRequest(`/device/${deviceId}`)
  }

  async getDeviceSoftware(deviceId: string) {
    return this.makeRequest(`/device/${deviceId}/software`)
  }

}

export const ninjaOne = new NinjaOneClient()

export interface NinjaDevice {
  id: number
  systemName: string
  nodeClass: string
  dnsName?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  os?: {
    name: string
    version: string
  }
  lastContact?: string
  customFields?: Array<{
    name: string
    value: string
  }>
}

export interface NinjaSoftware {
  name: string
  version: string
  publisher: string
  installDate?: string
}


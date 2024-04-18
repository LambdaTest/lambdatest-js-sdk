declare module 'cypress' {
    interface Chainable<Subject = any> {
      cylog(message: string): Chainable<Subject>;
    }
  }
  
  declare module 'httpClient' {
    interface HttpClient {
      request(options: object): Promise<any>;
      isSmartUIRunning(): Promise<any>;
      fetchDOMSerializer(): Promise<any>;
      postSnapshot(snapshot: any, testType: string): Promise<any>;
    }
    
    const httpClient: HttpClient;
    export = httpClient;
  }
  
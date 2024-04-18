import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { getSmartUIServerAddress } from './utils';

export interface HttpClient {
    request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    isSmartUIRunning(): Promise<AxiosResponse>;
    fetchDOMSerializer(): Promise<AxiosResponse>;
    postSnapshot(data: any): Promise<AxiosResponse>;
}

declare const httpClient: HttpClient;
export default httpClient;

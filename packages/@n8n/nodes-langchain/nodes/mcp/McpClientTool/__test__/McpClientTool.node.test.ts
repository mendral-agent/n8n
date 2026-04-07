import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpError, ErrorCode, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { mock, mockDeep } from 'jest-mock-extended';
import { StructuredToolkit } from 'n8n-core';
import {
	type IExecuteFunctions,
	NodeConnectionTypes,
	NodeOperationError,
	type ILoadOptionsFunctions,
	type INode,
	type ISupplyDataFunctions,
} from 'n8n-workflow';

import { proxyFetch } from '@n8n/ai-utilities';

import { getTools } from '../loadOptions';
import { McpClientTool } from '../McpClientTool.node';
import { buildMcpToolName } from '../utils';

jest.mock('@modelcontextprotocol/sdk/client/sse.js');
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@n8n/ai-utilities', () => ({
	...jest.requireActual('@n8n/ai-utilities'),
	proxyFetch: jest.fn(),
}));

const mockedProxyFetch = proxyFetch as jest.MockedFunction<typeof proxyFetch>;

describe('McpClientTool', () => {
	describe('loadOptions: getTools', () => {
		it('should return a list of tools', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'MyTool',
						description: 'MyTool does something',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
				],
			});

			const result = await getTools.call(
				mock<ILoadOptionsFunctions>({ getNode: jest.fn(() => mock<INode>({ typeVersion: 1 })) }),
			);

			expect(result).toEqual([
				{
					description: 'MyTool does something',
					name: 'MyTool',
					value: 'MyTool',
					inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
				},
			]);
		});

		it('should handle errors', async () => {
			jest.spyOn(Client.prototype, 'connect').mockRejectedValue(new Error('Fail!'));

			const node = mock<INode>({ typeVersion: 1 });
			await expect(
				getTools.call(mock<ILoadOptionsFunctions>({ getNode: jest.fn(() => node) })),
			).rejects.toEqual(new NodeOperationError(node, 'Could not connect to your MCP server'));
		});
	});

	describe('supplyData', () => {
		beforeEach(() => {
			jest.resetAllMocks();
		});

		it('should return a valid toolkit with usable tools (that returns a string)', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest
				.spyOn(Client.prototype, 'callTool')
				.mockResolvedValue({ content: [{ type: 'text', text: 'result from tool' }] });
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'MyTool1',
						description: 'MyTool1 does something',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
					{
						name: 'MyTool2',
						description: 'MyTool2 does something',
						inputSchema: { type: 'object', properties: { input2: { type: 'string' } } },
					},
				],
			});

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() => mock<INode>({ typeVersion: 1, name: 'MCP Client' })),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			expect(tools).toHaveLength(2);

			const toolCallResult = await tools[0].invoke({ input: 'foo' });
			expect(toolCallResult).toEqual(JSON.stringify([{ type: 'text', text: 'result from tool' }]));
		});

		it('should support selecting tools to expose', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'MyTool1',
						description: 'MyTool1 does something',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
					{
						name: 'MyTool2',
						description: 'MyTool2 does something',
						inputSchema: { type: 'object', properties: { input2: { type: 'string' } } },
					},
				],
			});

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() =>
						mock<INode>({
							typeVersion: 1,
							name: 'MCP Client',
						}),
					),
					getNodeParameter: jest.fn((key, _index) => {
						const parameters: Record<string, any> = {
							include: 'selected',
							includeTools: ['MyTool2'],
						};
						return parameters[key];
					}),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			expect(tools).toHaveLength(1);
			expect(tools[0].name).toBe(buildMcpToolName('MCP Client', 'MyTool2'));
		});

		it('should support selecting tools to exclude', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'MyTool1',
						description: 'MyTool1 does something',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
					{
						name: 'MyTool2',
						description: 'MyTool2 does something',
						inputSchema: { type: 'object', properties: { input2: { type: 'string' } } },
					},
				],
			});

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() =>
						mock<INode>({
							typeVersion: 1,
							name: 'MCP Client',
						}),
					),
					getNodeParameter: jest.fn((key, _index) => {
						const parameters: Record<string, any> = {
							include: 'except',
							excludeTools: ['MyTool2'],
						};
						return parameters[key];
					}),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			expect(tools).toHaveLength(1);
			expect(tools[0].name).toBe(buildMcpToolName('MCP Client', 'MyTool1'));
		});

		it('should support header auth', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'MyTool1',
						description: 'MyTool1 does something',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
				],
			});

			mockedProxyFetch.mockResolvedValue(new Response('ok', { status: 200 }));

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() => mock<INode>({ typeVersion: 1, name: 'MCP Client' })),
					getNodeParameter: jest.fn((key, _index) => {
						const parameters: Record<string, any> = {
							include: 'except',
							excludeTools: ['MyTool2'],
							authentication: 'headerAuth',
							sseEndpoint: 'https://my-mcp-endpoint.ai/sse',
						};
						return parameters[key];
					}),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
					getCredentials: jest.fn().mockResolvedValue({ name: 'my-header', value: 'header-value' }),
				}),
				0,
			);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const url = new URL('https://my-mcp-endpoint.ai/sse');
			expect(SSEClientTransport).toHaveBeenCalledTimes(1);
			expect(SSEClientTransport).toHaveBeenCalledWith(url, {
				eventSourceInit: { fetch: expect.any(Function) },
				fetch: expect.any(Function),
			});

			// Verify the eventSourceInit fetch injects auth headers and Accept header
			const customFetch = jest.mocked(SSEClientTransport).mock.calls[0][1]?.eventSourceInit?.fetch;
			await customFetch?.(url, {} as any);
			expect(mockedProxyFetch).toHaveBeenCalledWith(url, {
				headers: { Accept: 'text/event-stream', 'my-header': 'header-value' },
			});
		});

		it('should support bearer auth', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'MyTool1',
						description: 'MyTool1 does something',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
				],
			});

			mockedProxyFetch.mockResolvedValue(new Response('ok', { status: 200 }));

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() => mock<INode>({ typeVersion: 1, name: 'MCP Client' })),
					getNodeParameter: jest.fn((key, _index) => {
						const parameters: Record<string, any> = {
							include: 'except',
							excludeTools: ['MyTool2'],
							authentication: 'bearerAuth',
							sseEndpoint: 'https://my-mcp-endpoint.ai/sse',
						};
						return parameters[key];
					}),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
					getCredentials: jest.fn().mockResolvedValue({ token: 'my-token' }),
				}),
				0,
			);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const url = new URL('https://my-mcp-endpoint.ai/sse');
			expect(SSEClientTransport).toHaveBeenCalledTimes(1);
			expect(SSEClientTransport).toHaveBeenCalledWith(url, {
				eventSourceInit: { fetch: expect.any(Function) },
				fetch: expect.any(Function),
			});

			// Verify the eventSourceInit fetch injects auth headers and Accept header
			const customFetch = jest.mocked(SSEClientTransport).mock.calls[0][1]?.eventSourceInit?.fetch;
			await customFetch?.(url, {} as any);
			expect(mockedProxyFetch).toHaveBeenCalledWith(url, {
				headers: { Accept: 'text/event-stream', Authorization: 'Bearer my-token' },
			});
		});

		it('should successfully execute a tool', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest
				.spyOn(Client.prototype, 'callTool')
				.mockResolvedValue({ toolResult: 'Sunny', content: [] });
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'Weather Tool',
						description: 'Gets the current weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
				],
			});

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() =>
						mock<INode>({
							typeVersion: 1,
							name: 'MCP Client',
						}),
					),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			const toolResult = await tools[0].invoke({ location: 'Berlin' });
			expect(toolResult).toEqual('Sunny');
		});

		it('should handle tool errors', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				isError: true,
				toolResult: 'Weather unknown at location',
				content: [{ text: 'Weather unknown at location' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'Weather Tool',
						description: 'Gets the current weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
				],
			});

			const supplyDataFunctions = mock<ISupplyDataFunctions>({
				getNode: jest.fn(() =>
					mock<INode>({
						typeVersion: 1,
						name: 'MCP Client',
					}),
				),
				logger: { debug: jest.fn(), error: jest.fn() },
				addInputData: jest.fn(() => ({ index: 0 })),
			});
			const supplyDataResult = await new McpClientTool().supplyData.call(supplyDataFunctions, 0);

			expect(supplyDataResult.closeFunction).toBeInstanceOf(Function);
			expect(supplyDataResult.response).toBeInstanceOf(StructuredToolkit);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			const toolResult = await tools[0].invoke({ location: 'Berlin' });
			expect(toolResult).toEqual('Weather unknown at location');
			expect(supplyDataFunctions.addOutputData).toHaveBeenCalledWith(
				NodeConnectionTypes.AiTool,
				0,
				new NodeOperationError(supplyDataFunctions.getNode(), 'Weather unknown at location'),
			);
		});

		it('should support setting a timeout', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			const callToolSpy = jest
				.spyOn(Client.prototype, 'callTool')
				.mockRejectedValue(
					new McpError(ErrorCode.RequestTimeout, 'Request timed out', { timeout: 200 }),
				);
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'SlowTool',
						description: 'SlowTool throws a timeout',
						inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
					},
				],
			});

			const mockNode = mock<INode>({ typeVersion: 1, name: 'MCP Client' });
			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() => mockNode),
					getNodeParameter: jest.fn((key, _index) => {
						const parameters: Record<string, any> = {
							'options.timeout': 200,
						};
						return parameters[key];
					}),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();

			await expect(tools[0].invoke({ input: 'foo' })).resolves.toEqual(
				'MCP error -32001: Request timed out',
			);
			expect(callToolSpy).toHaveBeenCalledWith(
				expect.any(Object), // params
				expect.any(Object), // schema
				expect.objectContaining({ timeout: 200 }),
			); // options
		});
	});

	describe('execute', () => {
		beforeEach(() => {
			jest.resetAllMocks();
		});

		it('should execute tool when tool name is in item.json.tool (from agent)', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				content: [{ type: 'text', text: 'Weather is sunny' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets the weather',
						inputSchema: {
							type: 'object',
							properties: { location: { type: 'string' } },
						},
					},
				],
			});

			const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: buildMcpToolName('MCP Client', 'get_weather'),
							location: 'Berlin',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'all',
						includeTools: [],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			const result = await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(result).toEqual([
				[
					{
						json: {
							response: [{ type: 'text', text: 'Weather is sunny' }],
						},
						pairedItem: { item: 0 },
					},
				],
			]);

			expect(Client.prototype.callTool).toHaveBeenCalledWith(
				{
					name: 'get_weather',
					arguments: { location: 'Berlin' },
				},
				expect.anything(),
				expect.anything(),
			);
		});

		it.each([false, undefined])(
			'should filter out tool arguments when additionalProperties is %s',
			async (additionalProperties) => {
				jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
				jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
					content: [{ type: 'text', text: 'Weather is sunny' }],
				});
				jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
					tools: [
						{
							name: 'get_weather',
							description: 'Gets the weather',
							inputSchema: {
								type: 'object',
								properties: { location: { type: 'string' } },
								additionalProperties,
							},
						},
					],
				});

				const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
				const mockExecuteFunctions = mock<any>({
					getNode: jest.fn(() => mockNode),
					getInputData: jest.fn(() => [
						{
							json: {
								tool: buildMcpToolName('MCP Client', 'get_weather'),
								location: 'Berlin',
								foo: 'bar',
								sessionId: '123',
							},
						},
					]),
					getNodeParameter: jest.fn((key) => {
						const params: Record<string, any> = {
							include: 'all',
							includeTools: [],
							excludeTools: [],
							authentication: 'none',
							sseEndpoint: 'https://test.com/sse',
							'options.timeout': 60000,
						};
						return params[key];
					}),
				});

				const result = await new McpClientTool().execute.call(mockExecuteFunctions);

				expect(result).toEqual([
					[
						{
							json: {
								response: [{ type: 'text', text: 'Weather is sunny' }],
							},
							pairedItem: { item: 0 },
						},
					],
				]);

				expect(Client.prototype.callTool).toHaveBeenCalledWith(
					{
						name: 'get_weather',
						arguments: { location: 'Berlin' },
					},
					expect.anything(),
					expect.anything(),
				);
			},
		);

		it('should pass all arguments when schema has additionalProperties: true', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				content: [{ type: 'text', text: 'Success' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'flexible_tool',
						description: 'Accepts any arguments',
						inputSchema: { type: 'object', additionalProperties: true },
					},
				],
			});

			const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: buildMcpToolName('MCP Client', 'flexible_tool'),
							foo: 'bar',
							extra: 'data',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'all',
						includeTools: [],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(Client.prototype.callTool).toHaveBeenCalledWith(
				{
					name: 'flexible_tool',
					arguments: { foo: 'bar', extra: 'data' },
				},
				expect.anything(),
				expect.anything(),
			);
		});

		it('should not execute if tool name does not match', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				content: [{ type: 'text', text: 'Should not be called' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets the weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
				],
			});

			const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: 'different_tool',
							location: 'Berlin',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'all',
						includeTools: [],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			const result = await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(result).toEqual([[]]);
			expect(Client.prototype.callTool).not.toHaveBeenCalled();
		});

		it('should throw error when MCP server connection fails', async () => {
			jest.spyOn(Client.prototype, 'connect').mockRejectedValue(new Error('Connection failed'));

			const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: 'get_weather',
							location: 'Berlin',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'all',
						includeTools: [],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			await expect(new McpClientTool().execute.call(mockExecuteFunctions)).rejects.toThrow(
				NodeOperationError,
			);
		});

		it('should handle multiple items', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest
				.spyOn(Client.prototype, 'callTool')
				.mockResolvedValueOnce({
					content: [{ type: 'text', text: 'Weather in Berlin is sunny' }],
				})
				.mockResolvedValueOnce({
					content: [{ type: 'text', text: 'Weather in London is rainy' }],
				});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets the weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
				],
			});

			const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: buildMcpToolName('MCP Client', 'get_weather'),
							location: 'Berlin',
						},
					},
					{
						json: {
							tool: buildMcpToolName('MCP Client', 'get_weather'),
							location: 'London',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'all',
						includeTools: [],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			const result = await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(result).toEqual([
				[
					{
						json: {
							response: [{ type: 'text', text: 'Weather in Berlin is sunny' }],
						},
						pairedItem: { item: 0 },
					},
					{
						json: {
							response: [{ type: 'text', text: 'Weather in London is rainy' }],
						},
						pairedItem: { item: 1 },
					},
				],
			]);

			expect(Client.prototype.callTool).toHaveBeenCalledTimes(2);
		});

		it('should respect tool filtering (selected tools)', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				content: [{ type: 'text', text: 'Weather is sunny' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets the weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
					{
						name: 'get_time',
						description: 'Gets the time',
						inputSchema: { type: 'object', properties: {} },
					},
				],
			});

			const mockNode = mock<INode>({ typeVersion: 1, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: buildMcpToolName('MCP Client', 'get_weather'),
							location: 'Berlin',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'selected',
						includeTools: ['get_weather'],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			const result = await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json.response).toEqual([{ type: 'text', text: 'Weather is sunny' }]);
		});

		it('should call MCP server with original unprefixed tool name', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				content: [{ type: 'text', text: 'Weather is sunny' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets the weather',
						inputSchema: {
							type: 'object',
							properties: { location: { type: 'string' } },
						},
					},
				],
			});

			const mockNode = mock<INode>({
				typeVersion: 1,
				type: 'mcpClientTool',
				name: 'GitHub MCP',
			});
			const mockExecuteFunctions = mock<any>({
				getNode: jest.fn(() => mockNode),
				getInputData: jest.fn(() => [
					{
						json: {
							tool: buildMcpToolName('GitHub MCP', 'get_weather'),
							location: 'Berlin',
						},
					},
				]),
				getNodeParameter: jest.fn((key) => {
					const params: Record<string, any> = {
						include: 'all',
						includeTools: [],
						excludeTools: [],
						authentication: 'none',
						sseEndpoint: 'https://test.com/sse',
						'options.timeout': 60000,
					};
					return params[key];
				}),
			});

			await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(Client.prototype.callTool).toHaveBeenCalledWith(
				{
					name: 'get_weather',
					arguments: { location: 'Berlin' },
				},
				expect.anything(),
				expect.anything(),
			);
		});

		it('should execute tool with timeout', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'callTool').mockResolvedValue({
				content: [{ type: 'text', text: 'Weather is sunny' }],
			});
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets the weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
				],
			});
			const mockNode = mock<INode>({ typeVersion: 1.2, type: 'mcpClientTool', name: 'MCP Client' });
			const mockExecuteFunctions = mockDeep<IExecuteFunctions>();
			mockExecuteFunctions.getNode.mockReturnValue(mockNode);
			mockExecuteFunctions.getInputData.mockReturnValue([
				{
					json: {
						tool: buildMcpToolName('MCP Client', 'get_weather'),
						location: 'Berlin',
					},
				},
			]);
			mockExecuteFunctions.getNodeParameter.mockImplementation((key, _idx, defaultValue) => {
				const params = {
					include: 'all',
					authentication: 'none',
					serverTransport: 'httpStreamable',
					endpointUrl: 'https://test.com/mcp',
					'options.timeout': 12345,
				};
				return params[key as keyof typeof params] ?? defaultValue;
			});

			await new McpClientTool().execute.call(mockExecuteFunctions);

			expect(Client.prototype.callTool).toHaveBeenCalledWith(
				{
					name: 'get_weather',
					arguments: { location: 'Berlin' },
				},
				CallToolResultSchema,
				{ timeout: 12345 },
			);
		});
	});

	describe('buildMcpToolName', () => {
		it('should prefix tool name with sanitized server name', () => {
			expect(buildMcpToolName('MCP Client', 'get_weather')).toBe('MCP_Client_get_weather');
		});

		it('should sanitize special characters in server name', () => {
			expect(buildMcpToolName('GitHub MCP (v2)', 'list_repos')).toBe('GitHub_MCP__v2__list_repos');
		});

		it('should truncate prefix when total length exceeds 64 characters', () => {
			const longToolName = 'a'.repeat(50);
			const result = buildMcpToolName('MyServer', longToolName);
			expect(result.length).toBeLessThanOrEqual(64);
			expect(result).toContain(longToolName);
		});

		it('should return original tool name when it alone exceeds 64 characters', () => {
			const longToolName = 'a'.repeat(65);
			expect(buildMcpToolName('Server', longToolName)).toBe(longToolName);
		});
	});

	describe('supplyData tool name prefixing', () => {
		beforeEach(() => {
			jest.resetAllMocks();
		});

		it('should prefix tool names with sanitized node name', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'list_tools',
						description: 'Lists tools',
						inputSchema: { type: 'object', properties: {} },
					},
				],
			});

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() =>
						mock<INode>({
							typeVersion: 1,
							name: 'GitHub MCP',
						}),
					),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			expect(tools[0].name).toBe('GitHub_MCP_list_tools');
		});

		it('should call MCP server with original tool name via supplyData tools', async () => {
			jest.spyOn(Client.prototype, 'connect').mockResolvedValue();
			jest
				.spyOn(Client.prototype, 'callTool')
				.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
			jest.spyOn(Client.prototype, 'listTools').mockResolvedValue({
				tools: [
					{
						name: 'get_weather',
						description: 'Gets weather',
						inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
					},
				],
			});

			const supplyDataResult = await new McpClientTool().supplyData.call(
				mock<ISupplyDataFunctions>({
					getNode: jest.fn(() =>
						mock<INode>({
							typeVersion: 1,
							name: 'Weather MCP',
						}),
					),
					logger: { debug: jest.fn(), error: jest.fn() },
					addInputData: jest.fn(() => ({ index: 0 })),
				}),
				0,
			);

			const tools = (supplyDataResult.response as StructuredToolkit).getTools();
			expect(tools[0].name).toBe('Weather_MCP_get_weather');

			await tools[0].invoke({ location: 'Berlin' });

			expect(Client.prototype.callTool).toHaveBeenCalledWith(
				{ name: 'get_weather', arguments: { location: 'Berlin' } },
				expect.anything(),
				expect.anything(),
			);
		});
	});
});

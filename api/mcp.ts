// api/mcp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// 1. Create MCP server instance
const server = new McpServer({
  name: 'vercel-mcp-demo',
  version: '1.0.0',
});

// 2. "Successful" tool: echoes a message back
server.registerTool(
  'echo_success',
  {
    title: 'Successful Echo',
    description: 'Echoes the provided message back to the caller.',
    inputSchema: {
      message: z.string(),
    },
    outputSchema: {
      echoed: z.string(),
    },
  },
  async ({ message }) => {
    const output = { echoed: message };

    return {
      // What the model can parse as plain text
      content: [
        {
          type: 'text' as const,
          text: `Echoed message: ${message}`,
        },
      ],
      // What the model can parse structurally
      structuredContent: output,
    };
  }
);

// 3. "Failing" tool: deliberately throws an error
server.registerTool(
  'always_fail',
  {
    title: 'Always Fails',
    description:
      'Deliberately throws an error every time, useful for testing error handling.',
    inputSchema: {
      reason: z.string().optional(), // let the model/user explain why
    },
    outputSchema: {
      // Won't actually be returned; just here for schema completeness
      ok: z.boolean(),
    },
  },
  async ({ reason }) => {
    // Throwing here will cause an MCP error result
    throw new Error(
      `Intentional failure from always_fail tool${
        reason ? ` (reason: ${reason})` : ''
      }`
    );
  }
);

// 4. Vercel handler using Streamable HTTP MCP transport
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Create a new transport *per request* to avoid request ID collisions
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Clean up if the client disconnects
  res.on('close', () => {
    transport.close();
  });

  // Wire the MCP server to this HTTP transport
  await server.connect(transport);

  // Handle the MCP request
  await transport.handleRequest(req, res, req.body as any);
}


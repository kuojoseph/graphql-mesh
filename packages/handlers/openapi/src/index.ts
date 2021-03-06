import {
  readFileOrUrlWithCache,
  parseInterpolationStrings,
  getInterpolatedHeadersFactory,
  getHeadersObject,
} from '@graphql-mesh/utils';
import { createGraphQLSchema } from './openapi-to-graphql';
import { Oas3 } from './openapi-to-graphql/types/oas3';
import { MeshHandlerLibrary, YamlConfig, ResolverData } from '@graphql-mesh/types';
import { fetchache, Request } from 'fetchache';

const handler: MeshHandlerLibrary<YamlConfig.OpenapiHandler> = {
  async getMeshSource({ config, cache }) {
    const path = config.source;
    const spec = await readFileOrUrlWithCache<Oas3>(path, cache, {
      headers: config.schemaHeaders,
    });

    const fetch: WindowOrWorkerGlobalScope['fetch'] = (...args) =>
      fetchache(args[0] instanceof Request ? args[0] : new Request(...args), cache);

    const headersFactory = getInterpolatedHeadersFactory(config.operationHeaders);

    const { schema } = await createGraphQLSchema(spec, {
      fetch,
      baseUrl: config.baseUrl,
      skipSchemaValidation: config.skipSchemaValidation,
      operationIdFieldNames: true,
      fillEmptyResponses: true,
      viewer: false,
      resolverMiddleware: (getResolverParams, originalFactory) => (root, args, context, info: any) => {
        const resolverData: ResolverData = { root, args, context, info };
        const resolverParams = getResolverParams();
        resolverParams.requestOptions = {
          headers: getHeadersObject(headersFactory(resolverData)),
        };
        return originalFactory(() => resolverParams)(root, args, context, info);
      },
    });

    const { args, contextVariables } = parseInterpolationStrings(Object.values(config.operationHeaders || {}));

    const rootFields = [
      ...Object.values(schema.getQueryType()?.getFields() || {}),
      ...Object.values(schema.getMutationType()?.getFields() || {}),
      ...Object.values(schema.getSubscriptionType()?.getFields() || {}),
    ];

    for (const rootField of rootFields) {
      for (const argName in args) {
        const argConfig = args[argName];
        rootField.args.push({
          name: argName,
          description: undefined,
          defaultValue: undefined,
          extensions: undefined,
          astNode: undefined,
          ...argConfig,
        });
      }
    }

    return {
      schema,
      contextVariables,
    };
  },
};

export default handler;

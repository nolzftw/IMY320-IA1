import { dotnet } from './_framework/dotnet.js'

  const { setModuleImports, getAssemblyExports, getConfig } = await dotnet
      .withDiagnosticTracing(false)
      .create();

  const config = getConfig();
  const exports = await getAssemblyExports(config.mainAssemblyName);

  console.log('WebAssembly module loaded successfully');
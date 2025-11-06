functions: Request to https://cloudfunctions.googleapis.com/v2/projects/foodsharing-watcher/locations/europe-west3/functions/proxy?updateMask=name%2CbuildConfig.runtime%2CbuildConfig.entryPoint%2CbuildConfig.source.storageSource.bucket%2CbuildConfig.source.storageSource.object%2CbuildConfig.environmentVariables%2CbuildConfig.sourceToken%2CserviceConfig.environmentVariables%2CserviceConfig.secretEnvironmentVariables%2CserviceConfig.ingressSettings%2CserviceConfig.timeoutSeconds%2CserviceConfig.serviceAccountEmail%2CserviceConfig.availableMemory%2CserviceConfig.minInstanceCount%2CserviceConfig.maxInstanceCount%2CserviceConfig.maxInstanceRequestConcurrency%2CserviceConfig.availableCpu%2CserviceConfig.vpcConnector%2CserviceConfig.vpcConnectorEgressSettings%2Clabels had HTTP Error: 400, Could not update Cloud Run service projects/foodsharing-watcher/locations/europe-west3/services/proxy. spec.template.spec.containers[0].env: Secret environment variable overlaps non secret environment variable: FOODWATCH_SMTP_HOST
!  functions:  failed to update function projects/foodsharing-watcher/locations/europe-west3/functions/proxy
Failed to update function projects/foodsharing-watcher/locations/europe-west3/functions/proxy

Functions deploy had errors with the following functions:
        proxy(europe-west3)

Error: There was an error deploying functions
PS C:\ws\foodsharing> npm install --save firebase-functions@latest
npm warn config production Use `--omit=dev` instead.
npm warn Unknown user config "msvs_version". This will stop working in the next major version of npm.

added 1 package, removed 4 packages, changed 4 packages, and audited 1230 packages in 4s

178 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

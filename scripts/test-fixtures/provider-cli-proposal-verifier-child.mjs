import { verifyProviderCliPackageContentProposal } from '../propose-provider-cli-package-content.mjs'

const [, , rootPath, proposalPath, tarballBase64, ...unexpected] = process.argv
if (!rootPath || !proposalPath || !tarballBase64 || unexpected.length > 0) {
  throw new Error('provider CLI proposal verifier child requires exactly root, proposal, and tarball arguments')
}

const verification = await verifyProviderCliPackageContentProposal({
  rootPath,
  proposalPath,
  fetchImpl: async url => {
    const response = new Response(Buffer.from(tarballBase64, 'base64'), { status: 200 })
    Object.defineProperty(response, 'url', { value: url })
    return response
  },
})

process.stdout.write(JSON.stringify(verification))

export function DeveloperDemo() {
  return (
    <main>
      <section className="demo-header">
        <a className="back-link" href="#/">← Back to vault portal</a>
        <span className="pill demo-pill">Disabled in mainnet build</span>
        <h1>Developer testnet demo unavailable</h1>
        <p>
          The production RHBurnerPass frontend does not expose the testnet reference mint.
          Use the tagged testnet release or a separate local testnet checkout for integration testing.
        </p>
      </section>
    </main>
  )
}

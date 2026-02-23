#!/usr/bin/env python3
"""
GenLayer Deployment Script — Breakup Arbitrator
Deploy to localnet, studionet, or testnet.
"""
import asyncio
import os
from genlayer import GenLayerClient, Account


async def deploy_contract():
    """Deploy BreakupArbitrator contract to GenLayer network"""

    networks = {
        "localnet": {"rpc_url": "http://localhost:4000", "chain_id": 1337},
        "studionet": {"rpc_url": "https://studio.genlayer.com/api", "chain_id": 1337},
        "testnet_asimov": {"rpc_url": "https://testnet.genlayer.com/api", "chain_id": 42},
    }

    network = os.getenv("GENLAYER_NETWORK", "localnet")
    config = networks[network]

    print(f"🚀 Deploying: contracts/breakup_arbitrator.py")
    print(f"📡 Network:  {network} ({config['rpc_url']})")

    client = GenLayerClient(rpc_url=config["rpc_url"])
    account = Account.from_private_key(
        os.getenv("PRIVATE_KEY", "your-private-key-here")
    )

    # ---- Replace with real partner addresses ---- #
    partner_a = os.getenv("PARTNER_A", "0x0000000000000000000000000000000000000001")
    partner_b = os.getenv("PARTNER_B", "0x0000000000000000000000000000000000000002")

    try:
        with open("contracts/breakup_arbitrator.py", "r") as f:
            contract_code = f.read()

        args = [partner_a, partner_b]
        print(f"📝 Partner A: {partner_a}")
        print(f"📝 Partner B: {partner_b}")

        deployment_result = await client.deploy_contract(
            contract_code=contract_code,
            constructor_args=args,
            account=account,
            wait_for_confirmation=True,
        )

        print("✅ Contract deployed successfully!")
        print(f"📄 Contract Address: {deployment_result['contract_address']}")
        print(f"🔗 Transaction Hash: {deployment_result['transaction_hash']}")

        return deployment_result

    except Exception as error:
        print(f"❌ Deployment failed: {error}")
        raise


if __name__ == "__main__":
    result = asyncio.run(deploy_contract())
    print("🎉 Deployment completed!")

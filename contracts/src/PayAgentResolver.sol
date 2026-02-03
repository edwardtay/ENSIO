// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title IExtendedResolver
/// @notice ENSIP-10 interface for wildcard resolution
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @title PayAgentResolver
/// @notice ERC-3668 CCIP-Read offchain resolver for PayAgent ENS preferences
///         with ENSIP-10 wildcard resolution.
///
/// Set this resolver on a parent name (e.g. `payagent.eth`), and it will
/// handle resolution for all subnames (`alice.payagent.eth`, `bob.payagent.eth`, etc.)
/// without requiring individual on-chain records.
///
/// For `com.payagent.*` text keys, the resolver reverts with OffchainLookup,
/// directing ENS clients to fetch the data from a trusted offchain gateway.
/// The gateway response is verified on-chain via resolveWithProof.
contract PayAgentResolver is IExtendedResolver {
    using ECDSA for bytes32;

    // --- Errors ---

    /// @dev ERC-3668: signals the client to fetch data from the gateway
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    error InvalidSignature();
    error SignatureExpired();

    // --- Immutables ---

    /// @notice Trusted gateway signer address (set at deploy)
    address public immutable signer;

    /// @notice Gateway URL template (ERC-3668 format with {sender} and {data} placeholders)
    string public gatewayUrl;

    // --- Constructor ---

    /// @param _signer Address of the gateway signer (must match GATEWAY_SIGNER_KEY)
    /// @param _gatewayUrl ERC-3668 gateway URL template, e.g.
    ///        "https://app.example.com/api/ens/gateway/{sender}/{data}.json"
    constructor(address _signer, string memory _gatewayUrl) {
        signer = _signer;
        gatewayUrl = _gatewayUrl;
    }

    // --- EIP-165 ---

    /// @notice Advertises support for IExtendedResolver (ENSIP-10) and EIP-165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId // 0x9061b923
            || interfaceId == 0x01ffc9a7; // EIP-165
    }

    // --- ENSIP-10 resolve (wildcard) ---

    /// @notice Called by ENS Universal Resolver. Accepts DNS wire-format name for wildcard support.
    /// @param name DNS wire-format encoded name (e.g. \x05alice\x08payagent\x03eth\x00)
    /// @param data The ABI-encoded resolver call (e.g. text(node, key))
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        override
        returns (bytes memory)
    {
        // Decode the function selector from the resolver call
        bytes4 selector = bytes4(data[:4]);

        // Only intercept text() calls — selector 0x59d1d43c
        if (selector != bytes4(0x59d1d43c)) {
            revert("PayAgentResolver: unsupported function");
        }

        // Decode the key from the text() call: text(bytes32 node, string key)
        (, string memory key) = abi.decode(data[4:], (bytes32, string));

        // Only handle com.payagent.* keys
        if (!_isPayAgentKey(key)) {
            revert("PayAgentResolver: not a payagent key");
        }

        // Build the extraData for the gateway: abi.encode(name, data)
        // The gateway receives the full DNS name to identify which subname
        // is being resolved (wildcard support).
        bytes memory extraData = abi.encode(name, data);

        // Build URLs array
        string[] memory urls = new string[](1);
        urls[0] = gatewayUrl;

        revert OffchainLookup(
            address(this),
            urls,
            extraData,        // callData sent to gateway
            this.resolveWithProof.selector,
            extraData         // passed back to resolveWithProof
        );
    }

    /// @notice ERC-3668 callback. Verifies the gateway signature and returns the result.
    /// @param response ABI-encoded (bytes result, uint64 expires, bytes signature)
    /// @param extraData The extraData from the original OffchainLookup
    /// @return The verified result bytes
    function resolveWithProof(bytes calldata response, bytes calldata extraData)
        external
        view
        returns (bytes memory)
    {
        (bytes memory result, uint64 expires, bytes memory sig) =
            abi.decode(response, (bytes, uint64, bytes));

        // Check expiry
        if (block.timestamp > expires) {
            revert SignatureExpired();
        }

        // Reconstruct the signed message
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                bytes2(0x1900),
                address(this),
                expires,
                keccak256(extraData),
                keccak256(result)
            )
        );

        // Recover signer from eth_sign style hash
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address recovered = ethSignedHash.recover(sig);
        if (recovered != signer) {
            revert InvalidSignature();
        }

        return result;
    }

    // --- Internal helpers ---

    /// @dev Returns true if the key starts with "com.payagent."
    function _isPayAgentKey(string memory key) internal pure returns (bool) {
        bytes memory keyBytes = bytes(key);
        bytes memory prefix = bytes("com.payagent.");
        if (keyBytes.length < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; i++) {
            if (keyBytes[i] != prefix[i]) return false;
        }
        return true;
    }
}

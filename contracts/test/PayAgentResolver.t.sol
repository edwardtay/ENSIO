// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { PayAgentResolver, IExtendedResolver } from "../src/PayAgentResolver.sol";

contract PayAgentResolverTest is Test {
    PayAgentResolver public resolver;

    uint256 internal signerPk = 0xA11CE;
    address internal signerAddr;

    string constant GATEWAY_URL = "https://app.example.com/api/ens/gateway/{sender}/{data}.json";

    function setUp() public {
        signerAddr = vm.addr(signerPk);
        resolver = new PayAgentResolver(signerAddr, GATEWAY_URL);
    }

    // --- Helper: build DNS wire-format name ---

    /// @dev Encodes "label.payagent.eth" in DNS wire format
    function _dnsEncode(string memory label) internal pure returns (bytes memory) {
        bytes memory labelBytes = bytes(label);
        // format: <len>label<len>payagent<len>eth<0>
        return abi.encodePacked(
            uint8(labelBytes.length), labelBytes,
            uint8(8), "payagent",
            uint8(3), "eth",
            uint8(0)
        );
    }

    /// @dev Encodes "payagent.eth" in DNS wire format (parent name, no subname)
    function _dnsEncodeParent() internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(8), "payagent",
            uint8(3), "eth",
            uint8(0)
        );
    }

    // --- OffchainLookup tests ---

    function test_resolve_revertsWithOffchainLookup_forPayagentKey() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth"); // simplified for test
        string memory key = "com.payagent.token";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);

        // Should revert with OffchainLookup
        vm.expectRevert();
        resolver.resolve(dnsName, data);
    }

    function test_resolve_revertsWithOffchainLookup_forParentName() public {
        bytes memory dnsName = _dnsEncodeParent();
        bytes32 node = keccak256("payagent.eth");
        string memory key = "com.payagent.token";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);

        // Parent name should also trigger OffchainLookup
        vm.expectRevert();
        resolver.resolve(dnsName, data);
    }

    function test_resolve_wildcard_differentSubnames() public {
        // "bob.payagent.eth"
        bytes memory dnsNameBob = _dnsEncode("bob");
        bytes32 nodeBob = keccak256("bob.payagent.eth");
        string memory key = "com.payagent.chain";
        bytes memory dataBob = abi.encodeWithSelector(bytes4(0x59d1d43c), nodeBob, key);

        vm.expectRevert();
        resolver.resolve(dnsNameBob, dataBob);

        // "carol.payagent.eth"
        bytes memory dnsNameCarol = _dnsEncode("carol");
        bytes32 nodeCarol = keccak256("carol.payagent.eth");
        bytes memory dataCarol = abi.encodeWithSelector(bytes4(0x59d1d43c), nodeCarol, key);

        vm.expectRevert();
        resolver.resolve(dnsNameCarol, dataCarol);
    }

    function test_resolve_reverts_forNonPayagentKey() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        string memory key = "avatar";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);

        vm.expectRevert("PayAgentResolver: not a payagent key");
        resolver.resolve(dnsName, data);
    }

    function test_resolve_reverts_forNonTextSelector() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        // addr(bytes32) selector = 0xf1cb7e06
        bytes memory data = abi.encodeWithSelector(bytes4(0xf1cb7e06), node);

        vm.expectRevert("PayAgentResolver: unsupported function");
        resolver.resolve(dnsName, data);
    }

    // --- OffchainLookup extraData includes DNS name ---

    function test_resolve_extraDataContainsDnsName() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        string memory key = "com.payagent.token";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);

        // Build expected extraData
        bytes memory expectedExtraData = abi.encode(dnsName, data);

        // Expect OffchainLookup with the correct extraData
        string[] memory urls = new string[](1);
        urls[0] = GATEWAY_URL;

        vm.expectRevert(
            abi.encodeWithSelector(
                PayAgentResolver.OffchainLookup.selector,
                address(resolver),
                urls,
                expectedExtraData,
                resolver.resolveWithProof.selector,
                expectedExtraData
            )
        );
        resolver.resolve(dnsName, data);
    }

    // --- resolveWithProof tests ---

    function _buildSignedResponse(bytes memory extraData, bytes memory result, uint64 expires)
        internal
        view
        returns (bytes memory)
    {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                bytes2(0x1900),
                address(resolver),
                expires,
                keccak256(extraData),
                keccak256(result)
            )
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSignedHash);
        bytes memory sig = abi.encodePacked(r, s, v);
        return abi.encode(result, expires, sig);
    }

    function test_resolveWithProof_validSignature() public view {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        string memory key = "com.payagent.token";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);
        bytes memory extraData = abi.encode(dnsName, data);

        bytes memory result = abi.encode("USDC");
        uint64 expires = uint64(block.timestamp + 300);

        bytes memory response = _buildSignedResponse(extraData, result, expires);
        bytes memory returnedResult = resolver.resolveWithProof(response, extraData);
        assertEq(keccak256(returnedResult), keccak256(result));
    }

    function test_resolveWithProof_invalidSignature() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        string memory key = "com.payagent.token";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);
        bytes memory extraData = abi.encode(dnsName, data);

        bytes memory result = abi.encode("USDC");
        uint64 expires = uint64(block.timestamp + 300);

        // Sign with a DIFFERENT key
        uint256 wrongPk = 0xB0B;
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                bytes2(0x1900),
                address(resolver),
                expires,
                keccak256(extraData),
                keccak256(result)
            )
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, ethSignedHash);
        bytes memory sig = abi.encodePacked(r, s, v);
        bytes memory response = abi.encode(result, expires, sig);

        vm.expectRevert(PayAgentResolver.InvalidSignature.selector);
        resolver.resolveWithProof(response, extraData);
    }

    function test_resolveWithProof_expiredSignature() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        string memory key = "com.payagent.token";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);
        bytes memory extraData = abi.encode(dnsName, data);

        bytes memory result = abi.encode("USDC");
        uint64 expires = uint64(block.timestamp - 1);

        bytes memory response = _buildSignedResponse(extraData, result, expires);

        vm.expectRevert(PayAgentResolver.SignatureExpired.selector);
        resolver.resolveWithProof(response, extraData);
    }

    // --- EIP-165 supportsInterface ---

    function test_supportsInterface_extendedResolver() public view {
        // IExtendedResolver selector = 0x9061b923
        assertTrue(resolver.supportsInterface(type(IExtendedResolver).interfaceId));
    }

    function test_supportsInterface_eip165() public view {
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
    }

    function test_supportsInterface_unknown() public view {
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }

    // --- Signer + gateway ---

    function test_signer() public view {
        assertEq(resolver.signer(), signerAddr);
    }

    function test_gatewayUrl() public view {
        assertEq(resolver.gatewayUrl(), GATEWAY_URL);
    }

    // --- _isPayAgentKey coverage ---

    function test_resolve_handlesChainKey() public {
        bytes memory dnsName = _dnsEncode("alice");
        bytes32 node = keccak256("alice.payagent.eth");
        string memory key = "com.payagent.chain";
        bytes memory data = abi.encodeWithSelector(bytes4(0x59d1d43c), node, key);

        // Should revert with OffchainLookup (meaning it recognized the key)
        vm.expectRevert();
        resolver.resolve(dnsName, data);
    }
}

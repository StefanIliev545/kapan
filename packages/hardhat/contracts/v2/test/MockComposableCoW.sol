// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IComposableCoW, IValueFactory } from "../interfaces/cow/IComposableCoW.sol";
import { IConditionalOrder, IConditionalOrderGenerator } from "../interfaces/cow/IConditionalOrder.sol";
import { GPv2Order } from "../interfaces/cow/GPv2Order.sol";

/// @title MockComposableCoW
/// @notice Mock implementation of ComposableCoW for testing
contract MockComposableCoW is IComposableCoW {
    
    mapping(address => bytes32) public override roots;
    mapping(address => mapping(bytes32 => bool)) public override singleOrders;
    mapping(address => mapping(bytes32 => bytes32)) public override cabinet;
    
    // Track created orders for testing
    IConditionalOrder.ConditionalOrderParams[] public createdOrders;
    mapping(bytes32 => bool) public removedOrders;
    
    function create(
        IConditionalOrder.ConditionalOrderParams calldata params,
        bool dispatch
    ) external override {
        bytes32 orderHash = hash(params);
        singleOrders[msg.sender][orderHash] = true;
        createdOrders.push(params);
        
        if (dispatch) {
            emit ConditionalOrderCreated(msg.sender, params);
        }
    }
    
    function createWithContext(
        IConditionalOrder.ConditionalOrderParams calldata params,
        IValueFactory factory,
        bytes calldata data,
        bool dispatch
    ) external override {
        bytes32 ctx = factory.getValue(data);
        cabinet[msg.sender][hash(params)] = ctx;
        
        bytes32 orderHash = hash(params);
        singleOrders[msg.sender][orderHash] = true;
        createdOrders.push(params);
        
        if (dispatch) {
            emit ConditionalOrderCreated(msg.sender, params);
        }
    }
    
    function remove(bytes32 singleOrderHash) external override {
        singleOrders[msg.sender][singleOrderHash] = false;
        removedOrders[singleOrderHash] = true;
    }
    
    function setRoot(bytes32 root, Proof calldata proof) external override {
        roots[msg.sender] = root;
        emit MerkleRootSet(msg.sender, root, proof);
    }
    
    function setRootWithContext(
        bytes32 root,
        Proof calldata proof,
        IValueFactory factory,
        bytes calldata data
    ) external override {
        bytes32 ctx = factory.getValue(data);
        cabinet[msg.sender][root] = ctx;
        roots[msg.sender] = root;
        emit MerkleRootSet(msg.sender, root, proof);
    }
    
    function setCabinet(bytes32 ctx, bytes32 value) external override {
        cabinet[msg.sender][ctx] = value;
    }
    
    function getTradeableOrderWithSignature(
        address owner,
        IConditionalOrder.ConditionalOrderParams calldata params,
        bytes calldata offchainInput,
        bytes32[] calldata proof
    ) external view override returns (GPv2Order.Data memory order, bytes memory signature) {
        // Verify the order exists
        bytes32 orderHash = hash(params);
        require(singleOrders[owner][orderHash], "Order not found");
        
        // Get tradeable order from handler
        bytes32 ctx = proof.length == 0 ? orderHash : roots[owner];
        order = IConditionalOrderGenerator(address(params.handler)).getTradeableOrder(
            owner,
            msg.sender,
            ctx,
            params.staticData,
            offchainInput
        );
        
        // Build signature (simplified for testing)
        signature = abi.encode(PayloadStruct({
            proof: proof,
            params: params,
            offchainInput: offchainInput
        }));
    }
    
    function hash(IConditionalOrder.ConditionalOrderParams memory params) public pure override returns (bytes32) {
        return keccak256(abi.encode(params.handler, params.salt, params.staticData));
    }
    
    // Test helpers
    function getCreatedOrdersCount() external view returns (uint256) {
        return createdOrders.length;
    }
    
    function getCreatedOrder(uint256 index) external view returns (IConditionalOrder.ConditionalOrderParams memory) {
        return createdOrders[index];
    }
}

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const { MerkleTree } = require('merkletreejs');
const SHA256 = require('crypto-js/sha256');
const cliProgress = require('cli-progress');
const toBuffer = require('it-to-buffer');
/**
 * Summary: Generate a stamped merkle root for our network based on a list of CIDS.
 * @param timestamp: The timestamp we should use to stamp our leaves
 * @param ipfsNode:  The IPFS node we want to use in order to generate the root.
 * @param CIDs:      The list of CIDs we want to check.
 * @param options:  An object containing the following optional arguments:
        proofCallback: A callback that takes the CID and proofs of each generated leaf as an argument the result of the
                       function. This can be used to store proofs in a database of your choice
        stampCallback: A callback that takes a cid and timestamp and returns the stamp of the file. This can be used to
                       generate a custom timestamp for each leaf.
 * @returns TimestampedMerkleRoot The merkle root of the network. It is the caller's responsibility to provide a
    `proofCallback` should they want to store more information about the proofs.
 */
exports.fileProofMerkleRoot = (timestamp, ipfsNode, CIDs, options = {}) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Generating Merkle Root for CIDs: ", CIDs);
    // Initialize our return Object
    let returnObject = {
        root: '',
        timestamp: timestamp,
        stampFunction: options.stampFunction || defaultStamp
    };
    // Create a new merkle tree
    var leaves = [];
    // For each CID, generate a proof of inclusion
    console.log("Generating proofs...");
    const proofProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    proofProgressBar.start(CIDs.length, 0);
    for (let i = 0; i < CIDs.length; i++) {
        // Get the proof of inclusion, returns a boolean if the file is found
        let timeLimit = 5000;
        let failureValue = false;
        let proof = yield fulfillWithTimeLimit(timeLimit, fileProofDownload(ipfsNode, CIDs[i]), failureValue);
        // If the proof is valid, stamp it and add it to the list of leaves
        if (proof) {
            let leaf = {
                cid: CIDs[i],
                stamp: returnObject.stampFunction(CIDs[i], timestamp)
            };
            // Append a hash of the leaf to the list of leaves
            leaves.push(leaf);
        }
        else
            console.log("\nFILE FAILURE: ", CIDs[i]);
        proofProgressBar.update(i + 1);
    }
    proofProgressBar.stop();
    console.log("Generating Merkle Tree...");
    // Create a new merkle tree based on our leaves
    leaves = leaves.map(x => SHA256(x.cid, x.stamp));
    const tree = new MerkleTree(leaves, SHA256);
    // And get a root hash
    returnObject.root = tree.getRoot().toString('hex');
    console.log(tree.toString());
    // console.debug('[IPFS Verifier] Generated merkle root: ', returnObject.root)
    // If we have a callback for storing our proofs, call it on each leaf
    if (options.proofCallback) {
        console.log("Saving proofs...");
        proofProgressBar.start(CIDs.length, 0);
        // For each leaf,
        for (let i = 0; i < leaves.length; i++) {
            // Hash it and get its proof
            // https://github.com/miguelmota/merkletreejs/blob/master/docs/classes/_src_merkletree_.merkletree.md#getproof
            let merkle_proof = tree.getProof(leaves[i]);
            // console.debug('[IPFS Verifier] Proof of inclusion for leaf ', leaves[i], ": ", proof)
            // Call the callback with the proof object
            options.proofCallback(CIDs[i], merkle_proof);
            proofProgressBar.update(i + 1);
        }
        proofProgressBar.stop();
    }
    return returnObject;
});
/**
 * Summary: Verify a file's inclusion in a timestamped Merkle Tree
 * @param CID: The CID of the file we want to check
 * @param proof: The proof of inclusion of the file
 * @param merkleRoot: The Timestamped Merkle Root of the network
 * @returns boolean: True if the file is available on the network, false otherwise
 */
exports.fileStatus = (CID, proof, merkleRoot) => __awaiter(void 0, void 0, void 0, function* () {
    // Calculate the leaf of the file based on the CID and the timestamp
    let leaf = {
        cid: CID,
        stamp: merkleRoot.stampFunction(CID, merkleRoot.timestamp)
    };
    console.log("Testing inclusions of Leaf: ", leaf);
    // Verify the proof of inclusion using the Merkle Tree
    return MerkleTree.verify(proof, SHA256(leaf.cid, leaf.stamp), merkleRoot.root);
});
/* Helper Functions and Defaults */
/**
 * Summary: Default stamp function that generates a timestamp based on the CID and the timestamp.
 * @param cid: The CID of the file we want to stamp
 * @param timestamp: The timestamp we want to stamp the file with
 * @returns String: The stamp of the file
 */
const defaultStamp = (cid, timestamp) => {
    return SHA256(cid, timestamp).toString();
};
//TODO: Implement checking file status using Merkle Proofs
/**
 * Summary: Prove that a file is available on the network.
 * @param ipfsNode: The IPFS node we want to use to generate the proof.
 * @param CID: The CID of the file we want to check.
 * @returns boolean: True if the file is available on the network, false otherwise.
 */
const fileProof = (ipfsNode, CID) => __awaiter(void 0, void 0, void 0, function* () {
    // Get a challenge block from the IPFS node
    // let challengeBlock = await getChallengeBlock(ipfsNode, CID)
    var e_1, _a;
    // Check if the challenge block is valid against our maintained Merkle Tree
    // let root = tree.getRoot().toString('hex')
    // let leaf = SHA256(challengeBlock.data).toString()
    // let proof = tree.getProof(leaf)
    // return tree.verify(proof, leaf, tree.root)
    let ret = false;
    try {
        for (var _b = __asyncValues(ipfsNode.cat(CID)), _c; _c = yield _b.next(), !_c.done;) {
            const chunk = _c.value;
            ret = true;
            console.log("\nFile Reachable: ", CID);
            break;
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    // const fileStatus = await ipfsNode.files.stat("/ipfs/",CID)
    // return fileStatus.cid.toString() === CID
    return ret;
});
/**
 * Summary: Prove that a file is available on the network.
 * @param ipfsNode: The IPFS node we want to use to generate the proof.
 * @param CID: The CID of the file we want to check.
 * @returns boolean: True if the file is available on the network, false otherwise.
 */
const fileProofDownload = (ipfsNode, CID) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("\nFile: ", CID);
    const source = (yield toBuffer(ipfsNode.cat(CID)));
    const hash = (yield ipfsNode.add(source, { onlyHash: true })).cid.toString();
    let file_stored = (hash == CID);
    console.log("\nFile Reachable: ", file_stored);
    return file_stored;
});
/**
 * Summary: Fulfill a promise within a given time limit. If not fulfilled then return failure value
 * @param timeLimit: The max time to fulfill the promise
 * @param task: The Promise being limited
 * @param failureValue: The return value if the time limit is exceeded
 * @returns any: Failure value if timeout, the return type of the task if succeeds
 */
const fulfillWithTimeLimit = (timeLimit, task, failureValue) => __awaiter(void 0, void 0, void 0, function* () {
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
            resolve(failureValue);
        }, timeLimit);
    });
    const response = yield Promise.race([task, timeoutPromise]);
    if (timeout) { //the code works without this but let's be safe and clean up the timeout
        clearTimeout(timeout);
    }
    return response;
});
/**
 * Summary: Get a deterministic challenge block for a file
 * @param ipfsNode: The IPFS node we want to use to generate the challenge block.
 * @param CID: The CID of the file we want to get a challenge block for.
 * @returns ChallengeBlock: The challenge block for the file as a promise
 */
const getChallengeBlock = (ipfsNode, CID) => __awaiter(void 0, void 0, void 0, function* () {
    // Get all the block IDs for the file
    const links = yield ipfsNode.object.links(CID);
    const hashes = links.map((link) => link.Hash.toString());
    // Get a deterministic block index based on the hash of the file and the current time
    let index = SHA256(CID, Date.now()) % hashes.length;
    let block_cid = hashes[index];
    // Return the contents of the block
    return ipfsNode.cat(block_cid);
});

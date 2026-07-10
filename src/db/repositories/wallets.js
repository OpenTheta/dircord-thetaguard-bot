function createWalletsRepo(db) {
    return {
        add(wallet) {
            return db('wallets').insert(wallet).onConflict('wallet').merge();
        },
        getByUser(userId) {
            return db('wallets').where({ userId });
        },
        getByWallet(wallet) {
            return db('wallets').where({ wallet });
        },
    };
}

module.exports = { createWalletsRepo };

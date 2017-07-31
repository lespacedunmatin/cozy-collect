import styles from '../styles/accountConnection'

import React, { Component } from 'react'

import KonnectorAccount from '../components/KonnectorAccount'
import KonnectorSuccess from '../components/KonnectorSuccess'
import KonnectorSync from '../components/KonnectorSync'
import KonnectorFolder from '../components/KonnectorFolder'
import AccountConnectionData from '../components/AccountConnectionData'
import DescriptionContent from '../components/DescriptionContent'
import {popupCenter, waitForClosedPopup} from '../lib/popup'

import { ACCOUNT_ERRORS } from '../lib/accounts'

const SUCCESS_TYPES = {
  UPDATE: 'update',
  CONNECT: 'connect',
  TIMEOUT: 'timeout'
}

class AccountConnection extends Component {
  constructor (props, context) {
    super(props, context)
    this.store = this.context.store
    const konnector = props.connector
    this.state = {
      account: this.props.existingAccount,
      editing: !!this.props.existingAccount,
      success: null,
      submitting: this.store.isConnectionStatusRunning(konnector)
    }

    if (this.props.error) this.handleError({message: this.props.error})

    this.connectionListener = status => {
      this.setState({
        submitting: this.store.isConnectionStatusRunning(this.props.connector),
        // dirty hack waiting for better account management in store
        lastSync: Date.now()
      })
    }

    this.store.addConnectionStatusListener(konnector, this.connectionListener)
  }

  componentWillReceiveProps ({ existingAccount }) {
    this.setState({
      account: existingAccount
    })
  }

  componentWillUnmount () {
    this.store.removeConnectionStatusListener(this.props.connector, this.connectionListener)
  }

  connectAccount (auth) {
    const { folderPath } = auth
    const { connector } = this.props
    let { account } = this.state

    if (account) {
      return this.updateAccount(connector, account, auth)
    }

    account = {
      auth
    }

    this.setState({account: account})

    return this.runConnection(account, folderPath)
      .then(connection => {
        this.handleConnectionSuccess(connection.successTimeout)
      })
      .catch(error => this.handleError(error))
  }

  connectAccountOAuth (accountType, values) {
    this.setState({
      submitting: true,
      oAuthTerminated: false
    })

    const cozyUrl =
      `${window.location.protocol}//${document.querySelector('[role=application]').dataset.cozyDomain}`
    const newTab = popupCenter(`${cozyUrl}/accounts/${accountType}/start?scope=openid+profile+offline_access&state=xxx&nonce=${Date.now()}`, `${accountType}_oauth`, 800, 800)
    return waitForClosedPopup(newTab, `${accountType}_oauth`)
    .then(accountID => {
      return this.terminateOAuth(accountID, values.folderPath)
    })
    .catch(error => {
      this.setState({submitting: false, error: error.message})
    })
  }

  terminateOAuth (accountID, folderPath) {
    const { t } = this.context
    const { slug } = this.props.connector

    this.setState({
      oAuthTerminated: true
    })

    return this.store.fetchKonnectorInfos(slug)
      .then(konnector => {
        return this.store
          .fetchAccounts(slug)
          .then(accounts => {
            konnector.accounts = accounts
            const currentIdx = accounts.findIndex(a => a._id === accountID)
            const account = accounts[currentIdx]
            this.setState({account: account})
            account.folderPath = account.folderPath || null
            return this.runConnection(accounts[currentIdx], folderPath)
              .then(connection => {
                this.setState({
                  connector: konnector,
                  isConnected: konnector.accounts.length !== 0,
                  selectedAccount: currentIdx,
                  submitting: false
                })
                this.handleConnectionSuccess(connection.successTimeout)
              })
          })
          .catch(error => this.handleError(error))
      })
  }

  runConnection (account, folderPath) {
    this.setState({ submitting: true })

    return this.store.connectAccount(this.props.connector, account, folderPath, this.props.disableSuccessTimeout)
      .then(connection => {
        this.setState({ submitting: false })
        if (connection.account) {
          this.setState({
            account: connection.account
          })
        }

        if (connection.error) {
          return Promise.reject(connection.error)
        } else {
          return Promise.resolve(connection)
        }
      })
  }

  updateAccount (connector, account, values) {
    Object.assign(account.auth, values)

    this.setState({ submitting: true })

    return this.store.updateAccount(connector, account, values)
    .then(account => {
      this.setState({ account: account })
      return this.store.runAccount(connector, account, this.props.disableSuccessTimeout)
    })
    .then(() => this.handleUpdateSuccess())
    .catch(error => this.handleError(error))
  }

  deleteAccount () {
    // FIXME: disable unused account constant, see below
    // const { account } = this.state
    this.setState({ deleting: true })
    // FIXME: We're supposed to remove only the current account
    // but still we doesn't support the multi-account, we choose to remove all
    // existing accounts, in case of duplicates.
    this.store.deleteAccounts(this.props.connector/*, account */)
      .then(() => this.handleDeleteSuccess())
      .catch(error => this.handleError(error))
  }

  handleDeleteSuccess () {
    this.setState({
      submitting: false,
      deleting: false,
      error: null,
      success: null // exception for the delete success which uses alerts
    })

    this.props.alertSuccess([{message: 'account.message.success.delete'}])
  }

  handleConnectionSuccess (successTimeout) {
    const { t } = this.context
    const messages = [t('account.message.success.connect', {name: this.props.connector.name})]
    if (successTimeout) {
      return this.handleSuccess(SUCCESS_TYPES.TIMEOUT, messages)
    } else {
      return this.handleSuccess(SUCCESS_TYPES.CONNECT, messages)
    }
  }

  handleUpdateSuccess () {
    const { t } = this.context
    const messages = [t('account.message.success.update', {name: this.props.connector.name})]
    this.handleSuccess(SUCCESS_TYPES.UPDATE, messages)
  }

  handleSuccess (type, messages = []) {
    const { t } = this.context
    if (this.props.connector.additionnalSuccessMessage && this.props.connector.additionnalSuccessMessage.message) {
      messages.push(t(this.props.connector.additionnalSuccessMessage.message))
    }

    // when service usage
    if (this.props.onSuccess) return this.props.onSuccess(this.state.account)

    this.setState({
      submitting: false,
      deleting: false,
      error: null,
      success: {
        type,
        messages
      }
    })
  }

  handleError (error) {
    console.error(error)

    // when service usage
    if (this.props.onError) return this.props.onError(error)

    this.setState({
      submitting: false,
      deleting: false,
      error: error,
      success: null
    })
  }

  submit (values) {
    return this.props.connector && this.props.connector.oauth
         ? this.connectAccountOAuth(this.props.connector.slug, values)
         : this.connectAccount(values)
  }

  cancel () {
    this.props.onCancel()
  }

  goToConfig () {
    this.setState({ success: null, editing: true })
  }

  // TODO: use a better helper
  getIcon (konnector) {
    try {
      return require(`assets/icons/konnectors/${konnector.slug}.svg`)
    } catch (error) {
      console.warn(error.message)
      return require('assets/icons/konnectors/default.svg')
    }
  }

  forceConnection () {
    this.setState({submitting: true})
    this.store.runAccount(this.props.connector, this.state.account)
    .then(() => this.setState({submitting: false}))
    .catch(error => this.handleError(error))
  }

  render () {
    const { t, connector, fields, isUnloading } = this.props
    const { submitting, oAuthTerminated, deleting, error, success, account, editing } = this.state
    const hasGlobalError = error && error.message !== ACCOUNT_ERRORS.LOGIN_FAILED
    const lastSync = this.state.lastSync || account && account.lastSync
    return (
      <div className={styles['col-account-connection']}>
        <div className={styles['col-account-connection-header']}>
          <img
            className={styles['col-account-connection-icon']}
            src={this.getIcon(connector)} />
        </div>
        <div className={styles['col-account-connection-content']}>
          <div className={styles['col-account-connection-form']}>
            { hasGlobalError && <DescriptionContent
              cssClassesObject={{'coz-error': true}}
              title={t('account.message.error.global.title')}
              messages={[t('account.message.error.global.description', {name: connector.name})]}
            /> }

            { editing && !success && <KonnectorSync
              frequency={account && account.auth && account.auth.frequency}
              date={lastSync}
              submitting={submitting}
              onForceConnection={() => this.forceConnection()}
            /> }

            { editing && !success && <KonnectorFolder
              connector={connector}
              account={account}
              driveUrl={this.store.driveUrl}
            /> }

            { !success && <KonnectorAccount
              connector={connector}
              account={account}
              fields={fields}
              editing={editing}
              disableSuccessTimeout={this.props.disableSuccessTimeout}
              oAuthTerminated={oAuthTerminated}
              isUnloading={isUnloading}
              submitting={submitting}
              deleting={deleting}
              error={error}
              onDelete={() => this.deleteAccount()}
              onSubmit={(values) => this.submit(Object.assign(values, {folderPath: t('account.config.default_folder', connector)}))}
              onCancel={() => this.cancel()}
            /> }

            { success && <KonnectorSuccess
              success={success}
              connector={connector}
              folderId={account.folderId}
              driveUrl={this.store.driveUrl}
              isTimeout={success.type === SUCCESS_TYPES.TIMEOUT}
              folderPath={account && account.auth && account.auth.folderPath}
              onAccountConfig={() => this.goToConfig()}
              onCancel={() => this.cancel()}
              isUnloading={isUnloading}
            /> }
          </div>

          <AccountConnectionData
            connector={connector}
          />
        </div>
      </div>
    )
  }
}

export default AccountConnection

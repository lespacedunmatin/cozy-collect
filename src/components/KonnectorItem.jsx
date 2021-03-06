import styles from '../styles/konnectorItem'

import React, { Component } from 'react'
import { Link, withRouter } from 'react-router'
import { translate } from 'cozy-ui/react/I18n'
import { CONNECTION_STATUS } from '../lib/CollectStore'

class KonnectorItem extends Component {
  constructor (props, context) {
    super(props, context)
    this.store = this.context.store

    const { konnector } = this.props

    this.state = {
      status: this.store.getConnectionStatus(konnector)
    }

    this.connectionListener = status => {
      this.setState({
        status: status
      })
    }

    this.store.addConnectionStatusListener(konnector, this.connectionListener)
  }

  // Pretty tricky here : as preact renders all the KonnectorItem as a list, it
  // uses already existing components to re-render the list, so this component
  // may see its konnector change during its lifecycle.
  // So we have to stop listening to previous konnector status changes.
  // Otherwise, in CategoryList view, when we change the category as a konnector
  // is running, we may see other KonnectorItem having their status icon
  // changed.
  componentWillReceiveProps (nextProps) {
    this.store.removeConnectionStatusListener(this.props.konnector, this.connectionListener)
    this.store.addConnectionStatusListener(nextProps.konnector, this.connectionListener)
    this.setState({
      status: this.store.getConnectionStatus(nextProps.konnector)
    })
  }

  // Stop listening unmounted KonnectorItems
  componentWillUnmount () {
    this.store.removeConnectionStatusListener(this.props.konnector, this.connectionListener)
  }

  render ({ konnector, jobs, router }) {
    const { status } = this.state
    const { category, name, slug } = konnector
    return (
      <Link className='item-wrapper' to={`${router.location.pathname}/${slug}`}>
        <header className='item-header'>
          <img className='item-icon' src={icon(slug)} />
        </header>
        <p className='item-title'>{name}</p>
        {category && <p className='item-subtitle'>{category}</p>}
        {status && stateIcon(status)}
      </Link>
    )
  }
}

const svgIcon = (name) => (
  <svg className='item-status-icon'>
    <use xlinkHref={require(`../assets/sprites/icon-${name}.svg`)} /> }
  </svg>
)

const stateIcon = (status) => {
  switch (status) {
    case CONNECTION_STATUS.ERRORED:
      return svgIcon('warning')
    case CONNECTION_STATUS.CONNECTED:
      return svgIcon('check')
    case CONNECTION_STATUS.RUNNING:
      return <span className={styles['col-konnector-status-running']} />
    default:
      return null
  }
}

// Fallback to get the item icon and avoid error if not found
// with a possible default icon
const icon = (slug) => {
  let icon = ''
  try {
    icon = require(`../assets/icons/konnectors/${slug}.svg`)
  } catch (e) {
    icon = require('../assets/icons/konnectors/default.svg')
  }
  return icon
}

export default translate()(withRouter(KonnectorItem))

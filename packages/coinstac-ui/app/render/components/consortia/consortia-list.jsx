import React, { Component } from 'react';
import { connect } from 'react-redux';
import { compose, graphql } from 'react-apollo';
import { Alert, Button } from 'react-bootstrap';
import { LinkContainer } from 'react-router-bootstrap';
import PropTypes from 'prop-types';
import ListItem from '../common/list-item';
import ListDeleteModal from '../common/list-delete-modal';
import { updateUserPerms } from '../../state/ducks/auth';
import {
  ADD_USER_ROLE_MUTATION,
  CONSORTIUM_CHANGED_SUBSCRIPTION,
  DELETE_CONSORTIUM_MUTATION,
  FETCH_ALL_CONSORTIA_QUERY,
  FETCH_ALL_PIPELINES_QUERY,
  JOIN_CONSORTIUM_MUTATION,
  LEAVE_CONSORTIUM_MUTATION,
  PIPELINE_CHANGED_SUBSCRIPTION,
  REMOVE_USER_ROLE_MUTATION,
} from '../../state/graphql/functions';
import {
  consortiaMembershipProp,
  getAllAndSubProp,
  removeDocFromTableProp,
  userRolesProp,
} from '../../state/graphql/props';

const isUserA = (userId, groupArr) => {
  return groupArr.indexOf(userId) !== -1;
};

class ConsortiaList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      consortiumToDelete: -1,
      showModal: false,
      unsubscribeConsortia: null,
      unsubscribePipelines: null,
    };

    this.getOptions = this.getOptions.bind(this);
    this.deleteConsortium = this.deleteConsortium.bind(this);
    this.joinConsortium = this.joinConsortium.bind(this);
    this.leaveConsortium = this.leaveConsortium.bind(this);
    this.closeModal = this.closeModal.bind(this);
    this.openModal = this.openModal.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.consortia && !this.state.unsubscribeConsortia) {
      this.setState({ unsubscribeConsortia: this.props.subscribeToConsortia(null) });
    }

    if (nextProps.pipelines && !this.state.unsubscribePipelines) {
      this.setState({ unsubscribePipelines: this.props.subscribeToPipelines(null) });
    }
  }

  componentWillUnmount() {
    this.state.unsubscribeConsortia();
    this.state.unsubscribePipelines();
  }

  getOptions(member, owner, id) {
    const options = [];

    if (member && !owner) {
      options.push(
        <Button
          key="leave-cons-button"
          bsStyle="warning"
          className="pull-right"
          onClick={() => this.leaveConsortium(id)}
        >
          Leave Consortium
        </Button>
      );
    } else if (!member && !owner) {
      options.push(
        <Button
          key="join-cons-button"
          bsStyle="primary"
          className="pull-right"
          onClick={() => this.joinConsortium(id)}
        >
          Join Consortium
        </Button>
      );
    }

    return options;
  }

  closeModal() {
    this.setState({ showModal: false });
  }

  openModal(consortiumId) {
    return () => {
      this.setState({
        showModal: true,
        consortiumToDelete: consortiumId,
      });
    };
  }

  deleteConsortium() {
    const { auth: { user } } = this.props;

    this.props.deleteConsortiumById(this.state.consortiumToDelete);
    this.props.removeUserRole(user.id, 'consortia', this.state.consortiumToDelete, 'owner');
    this.closeModal();
  }

  joinConsortium(consortiumId) {
    const { auth: { user } } = this.props;

    this.props.joinConsortium(consortiumId);
    this.props.addUserRole(user.id, 'consortia', consortiumId, 'member');
  }

  leaveConsortium(consortiumId) {
    const { auth: { user } } = this.props;

    this.props.leaveConsortium(consortiumId);
    this.props.removeUserRole(user.id, 'consortia', consortiumId, 'member');
  }

  render() {
    const {
      auth: { user },
      consortia,
    } = this.props;

    return (
      <div>
        <div className="page-header clearfix">
          <h1 className="pull-left">Consortia</h1>
          <LinkContainer className="pull-right" to="/dashboard/consortia/new">
            <Button bsStyle="primary" className="pull-right">
              <span aria-hidden="true" className="glphicon glyphicon-plus" />
              {' '}
              Create Consortium
            </Button>
          </LinkContainer>
        </div>
        {consortia && consortia.map(consortium => (
          <ListItem
            key={`${consortium.name}-list-item`}
            itemObject={consortium}
            deleteItem={this.openModal}
            owner={isUserA(user.id, consortium.owners)}
            itemOptions={
              this.getOptions(
                isUserA(user.id, consortium.members),
                isUserA(user.id, consortium.owners),
                consortium.id
              )
            }
            itemRoute={'/dashboard/consortia'}
          />
        ))}
        {(!consortia || !consortia.length) &&
          <Alert bsStyle="info">
            No consortia found
          </Alert>
        }
        <ListDeleteModal
          close={this.closeModal}
          deleteItem={this.deleteConsortium}
          itemName={'consortium'}
          show={this.state.showModal}
        />
      </div>
    );
  }
}

ConsortiaList.propTypes = {
  addUserRole: PropTypes.func.isRequired,
  auth: PropTypes.object.isRequired,
  consortia: PropTypes.array,
  deleteConsortiumById: PropTypes.func.isRequired,
  joinConsortium: PropTypes.func.isRequired,
  leaveConsortium: PropTypes.func.isRequired,
  pipelines: PropTypes.array,
  removeUserRole: PropTypes.func.isRequired,
  subscribeToConsortia: PropTypes.func.isRequired,
  subscribeToPipelines: PropTypes.func.isRequired,
};

ConsortiaList.defaultProps = {
  consortia: null,
  pipelines: null,
};

const mapStateToProps = ({ auth }) => {
  return { auth };
};

const ConsortiaListWithData = compose(
  graphql(FETCH_ALL_CONSORTIA_QUERY, getAllAndSubProp(
    CONSORTIUM_CHANGED_SUBSCRIPTION,
    'consortia',
    'fetchAllConsortia',
    'subscribeToConsortia',
    'consortiumChanged'
  )),
  graphql(DELETE_CONSORTIUM_MUTATION, removeDocFromTableProp(
    'consortiumId',
    'deleteConsortiumById',
    FETCH_ALL_CONSORTIA_QUERY,
    'fetchAllConsortia'
  )),
  graphql(JOIN_CONSORTIUM_MUTATION, consortiaMembershipProp('joinConsortium')),
  graphql(LEAVE_CONSORTIUM_MUTATION, consortiaMembershipProp('leaveConsortium')),
  graphql(ADD_USER_ROLE_MUTATION, userRolesProp('addUserRole')),
  graphql(REMOVE_USER_ROLE_MUTATION, userRolesProp('removeUserRole')),
  graphql(FETCH_ALL_PIPELINES_QUERY, getAllAndSubProp(
    PIPELINE_CHANGED_SUBSCRIPTION,
    'pipelines',
    'fetchAllPipelines',
    'subscribeToPipelines',
    'pipelineChanged'
  ))
)(ConsortiaList);

export default connect(mapStateToProps, { updateUserPerms })(ConsortiaListWithData);